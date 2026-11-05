import { GeminiAdaptador } from "./adaptadores/gemini.js";
import { OpenAIAdaptador } from "./adaptadores/openai.js";
import { ClaudeAdaptador } from "./adaptadores/claude.js";
import { GroqAdaptador } from "./adaptadores/groq.js";
import { OllamaAdaptador } from "./adaptadores/ollama.js";
import { log } from "../log.js";

/*
  ============================================================================
  GESTOR MULTIPROVEDOR DE IA COM FALLBACK INTELIGENTE E TELEMETRIA
  ============================================================================
*/

export function criarGestorIA({
  supabase = null,
  userId = null,
  provedorPrimarioNome = process.env.VEZ_PROVEDOR_PRIMARIO || null,
  provedorSecundarioNome = process.env.VEZ_PROVEDOR_SECUNDARIO || null,
} = {}) {
  const provedores = {
    gemini: new GeminiAdaptador(),
    openai: new OpenAIAdaptador(),
    claude: new ClaudeAdaptador(),
    groq: new GroqAdaptador(),
    ollama: new OllamaAdaptador(),
  };

  function determinarPrimario() {
    if (provedorPrimarioNome && provedores[provedorPrimarioNome]?.estaConfigurado()) {
      return provedorPrimarioNome;
    }
    if (provedores.gemini.estaConfigurado()) return "gemini";
    if (provedores.groq.estaConfigurado()) return "groq";
    if (provedores.openai.estaConfigurado()) return "openai";
    if (provedores.claude.estaConfigurado()) return "claude";
    return "ollama";
  }

  function determinarSecundario(primario) {
    if (provedorSecundarioNome && provedores[provedorSecundarioNome]?.estaConfigurado() && provedorSecundarioNome !== primario) {
      return provedorSecundarioNome;
    }
    if (primario !== "groq" && provedores.groq.estaConfigurado()) return "groq";
    if (primario !== "gemini" && provedores.gemini.estaConfigurado()) return "gemini";
    if (primario !== "openai" && provedores.openai.estaConfigurado()) return "openai";
    if (primario !== "claude" && provedores.claude.estaConfigurado()) return "claude";
    if (primario !== "ollama") return "ollama";
    return null;
  }

  let primarioAtual = determinarPrimario();
  let secundarioAtual = determinarSecundario(primarioAtual);

  function podeFazerFallback(resposta) {
    if (!resposta || resposta.ok) return false;
    // Permite fallback em erro de quota, timeout, indisponibilidade ou falha interna do provedor
    return (
      resposta.ehLimiteDeQuota ||
      resposta.codigoStatus === 429 ||
      resposta.codigoStatus === 408 ||
      resposta.codigoStatus === 500 ||
      resposta.codigoStatus === 502 ||
      resposta.codigoStatus === 503 ||
      resposta.codigoStatus === 504 ||
      /timeout|fetch failed|rate limit|exhausted|overloaded|econnrefused/i.test(
        resposta.erro
      )
    );
  }

  async function gravarConsumo({
    resposta,
    operacao,
    idConversa = null,
    foiFallback = false,
  }) {
    if (!supabase || !userId) return;

    try {
      await supabase.from("consumo_ia").insert({
        user_id: userId,
        id_conversa: idConversa,
        provedor: resposta.provedor,
        modelo: resposta.modelo,
        operacao,
        tokens_entrada: resposta.tokensEntrada || 0,
        tokens_saida: resposta.tokensSaida || 0,
        tokens_total: resposta.tokensTotal || 0,
        custo_estimado: resposta.custoEstimado || 0,
        latencia_ms: resposta.latenciaMs || 0,
        sucesso: resposta.ok,
        erro: resposta.ok ? null : resposta.erro?.slice(0, 300),
        foi_fallback: foiFallback,
      });
    } catch (e) {
      // Falha de log não pode derrubar a resposta
      log.alerta(`[Consumo IA] Erro ao gravar telemetria: ${e.message}`);
    }
  }

  async function executarComFallback({
    metodo, // 'gerarJson' | 'gerarTexto'
    prompt,
    sistema,
    temperatura,
    operacao,
    idConversa = null,
  }) {
    const p1 = provedores[primarioAtual] || provedores.ollama;
    let resp = await p1[metodo]({ prompt, sistema, temperatura });

    if (resp.ok) {
      await gravarConsumo({ resposta: resp, operacao, idConversa, foiFallback: false });
      return resp;
    }

    // Avalia se o erro permite fallback inteligente
    if (secundarioAtual && podeFazerFallback(resp)) {
      log.alerta(
        `[IA Fallback] ${p1.nome} falhou (${resp.erro}). Alternando para ${secundarioAtual}...`
      );

      const p2 = provedores[secundarioAtual];
      if (p2) {
        const respFallback = await p2[metodo]({ prompt, sistema, temperatura });
        await gravarConsumo({
          resposta: respFallback,
          operacao,
          idConversa,
          foiFallback: true,
        });

        if (respFallback.ok) {
          log.info(`[IA Fallback] Resposta recuperada com sucesso via ${p2.nome}.`);
          return respFallback;
        }
        resp = respFallback;
      }
    }

    await gravarConsumo({ resposta: resp, operacao, idConversa, foiFallback: false });
    return resp;
  }

  return {
    obterProvedor(nome) {
      return provedores[nome] || null;
    },

    definirProvedor(nome, adaptador) {
      if (nome && adaptador) {
        provedores[nome] = adaptador;
      }
    },

    conectarBanco({ supabase: sb, userId: uid }) {
      if (sb) supabase = sb;
      if (uid) userId = uid;
    },

    async sincronizarComBanco(sb = supabase, uid = userId) {
      const cliente = sb || supabase;
      const dono = uid || userId;
      if (!cliente || !dono) return;

      try {
        const { data, error } = await cliente
          .from("config_ia")
          .select("provedor_primario, modelo_primario, provedor_secundario, modelo_secundario, fallback_ativo")
          .eq("user_id", dono)
          .maybeSingle();

        if (error || !data) return;

        if (data.provedor_primario && provedores[data.provedor_primario]) {
          primarioAtual = data.provedor_primario;
          if (data.modelo_primario) {
            provedores[data.provedor_primario].modeloPadrao = data.modelo_primario;
          }
        }

        if (data.fallback_ativo === false || data.provedor_secundario === "nenhum") {
          secundarioAtual = null;
        } else if (data.provedor_secundario && provedores[data.provedor_secundario]) {
          secundarioAtual = data.provedor_secundario;
          if (data.modelo_secundario) {
            provedores[data.provedor_secundario].modeloPadrao = data.modelo_secundario;
          }
        }

        log.info(
          `[Gestor IA] Sincronizado com Painel: Primário=${primarioAtual} (${provedores[primarioAtual]?.modeloPadrao}), ` +
          `Secundário=${secundarioAtual ? `${secundarioAtual} (${provedores[secundarioAtual]?.modeloPadrao})` : "Desligado"}`
        );
      } catch (err) {
        log.alerta(`[Gestor IA] Falha ao sincronizar com banco: ${err.message}`);
      }
    },

    configurarProvedores({ primario, secundario }) {
      if (provedores[primario]) primarioAtual = primario;
      if (secundario === "nenhum") secundarioAtual = null;
      else if (provedores[secundario]) secundarioAtual = secundario;
    },

    async pensar({ prompt, sistema, idConversa = null }) {
      const r = await executarComFallback({
        metodo: "gerarJson",
        prompt,
        sistema,
        temperatura: 0.1,
        operacao: "pensar",
        idConversa,
      });

      return r.ok ? r.dadosJson || r.texto : null;
    },

    async escrever({ prompt, sistema, temperatura = 0.7, idConversa = null }) {
      const r = await executarComFallback({
        metodo: "gerarTexto",
        prompt,
        sistema,
        temperatura,
        operacao: "escrever",
        idConversa,
      });

      return r.ok ? r.texto : null;
    },

    async status() {
      const onlineStatus = {};
      for (const [nome, p] of Object.entries(provedores)) {
        onlineStatus[nome] = {
          configurado: p.estaConfigurado(),
          modeloPadrao: p.modeloPadrao,
        };
      }
      return {
        primario: primarioAtual,
        secundario: secundarioAtual,
        provedores: onlineStatus,
      };
    },
  };
}
