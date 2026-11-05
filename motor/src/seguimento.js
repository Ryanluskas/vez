import crypto from "node:crypto";
import {
  decidirFollowup,
  MAXIMO_DE_FOLLOWUPS,
  ROTULO_DA_ETAPA,
  horarioDecente,
} from "./funil.js";
import { EVENTOS, observadorMudo } from "./observar.js";
import { telefoneAutorizadoNoPiloto } from "./piloto.js";
import { log } from "./log.js";

/*
  ============================================================================
  O SEGUIMENTO SUPERVISIONADO (FOLLOW-UP COM APROVAÇÃO OBRIGATÓRIA)

  Princípio inegociável da CapitalCred:
  Follow-ups externos SEMPRE dependem de aprovação humana no painel.

  1. A IA identifica conversas frias, sugere o momento ideal, o gancho e o texto.
     Cria uma linha na tabela `solicitacoes_followup` com status 'pendente'.
  2. O consultor visualiza a sugestão no painel, pode editar e aprova com 1 clique.
  3. Quando o status vira 'aprovada', o motor despacha pelo WhatsApp e marca
     'enviada' com timestamp oficial.
  4. Se o cliente responder antes do envio, a solicitação é cancelada.
  ============================================================================
*/

const VARREDURA_SUGESTOES_MS = 10 * 60 * 1000; // 10 minutos
const VARREDURA_ENVIOS_MS = 20 * 1000; // 20 segundos

export function criarSeguimento({
  supabase,
  maestro,
  userId,
  observador = observadorMudo(),
}) {
  /*
    ----------------------------------------------------------------------------
    FASE 1: Identificar inatividade e SUGERIR follow-up (NUNCA envia diretamente)
    ----------------------------------------------------------------------------
  */
  async function varrerSugestoes(agora = new Date()) {
    // Fora do horário comercial nem consulta o banco
    if (!horarioDecente(agora)) return { sugeridas: 0 };

    let query = supabase
      .from("conversas")
      .select(
        "id, telefone, nome, etapa, estagio, atender, seguir, followups_enviados, ultimo_followup_em, ultima_recebida_em, id_conexao, id_chat"
      )
      .eq("atender", true)
      .eq("seguir", true)
      .lt("followups_enviados", MAXIMO_DE_FOLLOWUPS)
      .in("etapa", ["conversando", "aguardando_documentos"]);

    if (userId && typeof query.eq === "function") {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      log.erro(`Varredura de sugestões de follow-up parada: ${error.message}`);
      return { sugeridas: 0, erro: error.message };
    }

    let sugeridas = 0;

    for (const conversa of data ?? []) {
      // Filtro estrito de Piloto Controlado: se o telefone não estiver autorizado, não gera sugestão
      if (!telefoneAutorizadoNoPiloto(conversa.telefone)) {
        continue;
      }

      const decisao = decidirFollowup(conversa, agora);
      if (!decisao.seguir) continue;

      // Confere se já existe uma solicitação pendente ou aprovada aguardando envio
      const { count } = await supabase
        .from("solicitacoes_followup")
        .select("id", { count: "exact", head: true })
        .eq("id_conversa", conversa.id)
        .in("status", ["pendente", "aprovada"]);

      if ((count ?? 0) > 0) continue;

      const motivo = `Inatividade na etapa "${
        ROTULO_DA_ETAPA[conversa.etapa] ?? conversa.etapa
      }" (tentativa ${decisao.tentativa} de ${MAXIMO_DE_FOLLOWUPS})`;

      const { error: erroInsert } = await supabase
        .from("solicitacoes_followup")
        .insert({
          user_id: userId,
          id_conversa: conversa.id,
          id_conexao: conversa.id_conexao ?? null,
          mensagem_sugerida: decisao.texto,
          motivo,
          estagio_comercial: conversa.etapa,
          tentativa: decisao.tentativa,
          momento_recomendado: agora.toISOString(),
          status: "pendente",
        });

      if (erroInsert) {
        log.erro(`Erro ao criar sugestão de follow-up para ${conversa.telefone}: ${erroInsert.message}`);
        continue;
      }

      sugeridas++;
      observador.registrar(EVENTOS.SEGUIMENTO, {
        idConversa: conversa.id,
        detalhe: `sugestão de follow-up gerada: tentativa ${decisao.tentativa}/${MAXIMO_DE_FOLLOWUPS}`,
      });

      log.info(
        `💡 Sugestão de follow-up gerada para aprovação (${decisao.tentativa}/${MAXIMO_DE_FOLLOWUPS}) → ${
          conversa.nome ?? conversa.telefone
        }`
      );
    }

    return { sugeridas };
  }

  /*
    ----------------------------------------------------------------------------
    FASE 2: Enviar follow-ups APROVADOS pelo consultor humano no painel
    ----------------------------------------------------------------------------
  */
  async function varrerEnviosAprovados(agora = new Date()) {
    if (!horarioDecente(agora)) return { enviados: 0 };

    let query = supabase
      .from("solicitacoes_followup")
      .select("id, id_conversa, id_conexao, mensagem_sugerida, mensagem_aprovada, tentativa, hash_aprovacao, aprovado_em, criado_em")
      .eq("status", "aprovada")
      .is("enviado_em", null);

    if (userId && typeof query.eq === "function") {
      query = query.eq("user_id", userId);
    }

    const { data: aprovadas, error } = await query
      .order("criado_em", { ascending: true })
      .limit(10);

    if (error || !aprovadas?.length) return { enviados: 0 };

    let enviados = 0;

    for (const solicitacao of aprovadas) {
      // 1. Expiração da aprovação: autorizações com mais de 24h não devem ser disparadas
      const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
      if (
        solicitacao.aprovado_em &&
        agora.getTime() - new Date(solicitacao.aprovado_em).getTime() > vinteQuatroHorasMs
      ) {
        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "expirada",
            rejeicao_motivo: "Aprovação expirou após 24 horas sem envio",
            atualizado_em: agora.toISOString(),
          })
          .eq("id", solicitacao.id);
        log.alerta(`Follow-up expirado (>24h) para conversa ${solicitacao.id_conversa}`);
        continue;
      }

      const { data: conversa } = await supabase
        .from("conversas")
        .select("id, telefone, nome, id_conexao, id_chat, ultima_recebida_em, atender, seguir, estagio, etapa, so_voce")
        .eq("id", solicitacao.id_conversa)
        .maybeSingle();

      if (!conversa || conversa.atender === false || conversa.seguir === false || conversa.etapa === "perdido") {
        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "cancelada",
            rejeicao_motivo: "Conversa foi desativada, silenciada ou solicitou opt-out",
            atualizado_em: agora.toISOString(),
          })
          .eq("id", solicitacao.id);
        continue;
      }

      // 1b. Filtro estrito de Piloto Controlado: impede disparo de follow-up para número fora da allowlist
      if (!telefoneAutorizadoNoPiloto(conversa.telefone)) {
        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "cancelada",
            rejeicao_motivo: "Telefone fora da allowlist do piloto controlado",
            atualizado_em: agora.toISOString(),
          })
          .eq("id", solicitacao.id);
        log.info(`[Piloto] Follow-up cancelado: ${conversa.nome ?? conversa.telefone} fora da allowlist.`);
        continue;
      }

      // 2. Intervenção humana ativa: se a conversa está com o consultor ou tem rascunho esperando, não manda follow-up
      if (
        conversa.estagio === "aguardando_voce" ||
        conversa.estagio === "rascunho_pronto" ||
        conversa.so_voce === true
      ) {
        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "cancelada",
            rejeicao_motivo: "Conversa em atendimento manual ativo pelo consultor",
            atualizado_em: agora.toISOString(),
          })
          .eq("id", solicitacao.id);
        log.info(`Follow-up cancelado: ${conversa.nome ?? conversa.telefone} em atendimento humano.`);
        continue;
      }

      // 3. Se o cliente respondeu depois que o follow-up foi sugerido, cancela
      if (
        conversa.ultima_recebida_em &&
        new Date(conversa.ultima_recebida_em).getTime() > new Date(solicitacao.criado_em).getTime()
      ) {
        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "cancelada",
            rejeicao_motivo: "Cliente já respondeu antes do disparo",
            atualizado_em: agora.toISOString(),
          })
          .eq("id", solicitacao.id);
        log.info(`Follow-up cancelado: ${conversa.nome ?? conversa.telefone} já respondeu.`);
        continue;
      }

      const textoParaEnviar = (solicitacao.mensagem_aprovada || solicitacao.mensagem_sugerida || "").trim();

      // 4. Integridade Criptográfica: se houver hash_aprovacao registrado, o texto deve ser idêntico
      if (solicitacao.hash_aprovacao) {
        const hashAtual = crypto.createHash("sha256").update(textoParaEnviar).digest("hex");
        if (hashAtual !== solicitacao.hash_aprovacao) {
          log.erro(`[Follow-up] Violação de integridade criptográfica para ${conversa.nome ?? conversa.telefone}. Envio abortado.`);
          await supabase
            .from("solicitacoes_followup")
            .update({
              status: "rejeitada",
              rejeicao_motivo: "Violação de integridade: texto alterado após aprovação humana",
              erro_envio: "Hash SHA-256 não confere com o texto aprovado",
              atualizado_em: agora.toISOString(),
            })
            .eq("id", solicitacao.id);
          continue;
        }
      }

      const idConexaoAlvo = solicitacao.id_conexao || conversa.id_conexao;
      const whatsapp =
        maestro.clientePara(idConexaoAlvo) ?? maestro.qualquerCliente?.();

      if (!whatsapp) {
        log.alerta(
          `Nenhum WhatsApp conectado para disparar follow-up aprovado de ${
            conversa.nome ?? conversa.telefone
          }`
        );
        continue;
      }
      const destino = conversa.id_chat ?? `${conversa.telefone}@c.us`;

      try {
        try {
          await whatsapp.sendMessage(destino, textoParaEnviar);
        } catch (primeiroErro) {
          if (
            (String(primeiroErro.message).includes("does not exist") ||
              String(primeiroErro.message).includes("404")) &&
            maestro.qualquerCliente
          ) {
            const fallbackWhatsapp = maestro.qualquerCliente();
            if (fallbackWhatsapp && fallbackWhatsapp !== whatsapp) {
              log.info(`[Follow-up] Instância falhou com 404. Tentando com conexão ativa...`);
              await fallbackWhatsapp.sendMessage(destino, textoParaEnviar);
            } else {
              throw primeiroErro;
            }
          } else {
            throw primeiroErro;
          }
        }
        const agoraIso = new Date().toISOString();

        await supabase
          .from("solicitacoes_followup")
          .update({
            status: "enviada",
            enviado_em: agoraIso,
            atualizado_em: agoraIso,
          })
          .eq("id", solicitacao.id);

        await supabase
          .from("conversas")
          .update({
            followups_enviados: solicitacao.tentativa,
            ultimo_followup_em: agoraIso,
            ultima_mensagem: textoParaEnviar,
            atualizado_em: agoraIso,
            ...(solicitacao.tentativa >= MAXIMO_DE_FOLLOWUPS ? { etapa: "perdido" } : {}),
          })
          .eq("id", conversa.id);

        await supabase.from("mensagens").insert({
          user_id: userId,
          id_conversa: conversa.id,
          direcao: "enviada",
          texto: textoParaEnviar,
        });

        observador.registrar(EVENTOS.SEGUIMENTO, {
          idConversa: conversa.id,
          detalhe: `follow-up aprovado enviado (tentativa ${solicitacao.tentativa} de ${MAXIMO_DE_FOLLOWUPS})`,
        });

        log.info(
          `↻ Follow-up supervisionado enviado (${solicitacao.tentativa}/${MAXIMO_DE_FOLLOWUPS}) → ${
            conversa.nome ?? conversa.telefone
          }`
        );
        enviados++;
      } catch (erro) {
        await supabase
          .from("solicitacoes_followup")
          .update({
            erro_envio: erro.message,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", solicitacao.id);

        observador.registrar(EVENTOS.ERRO, {
          idConversa: conversa.id,
          ok: false,
          detalhe: `falha no envio de follow-up aprovado: ${erro.message}`,
        });
        log.erro(`Falha no envio de follow-up para ${conversa.telefone}: ${erro.message}`);
      }
    }

    return { enviados };
  }

  return {
    varrerSugestoes,
    varrerEnviosAprovados,
    ligar() {
      const relogioSugestoes = setInterval(() => {
        varrerSugestoes().catch((e) =>
          log.erro(`varredura de sugestões de follow-up: ${e.message}`)
        );
      }, VARREDURA_SUGESTOES_MS);

      const relogioEnvios = setInterval(() => {
        varrerEnviosAprovados().catch((e) =>
          log.erro(`varredura de envios de follow-up aprovados: ${e.message}`)
        );
      }, VARREDURA_ENVIOS_MS);

      relogioSugestoes.unref?.();
      relogioEnvios.unref?.();

      return () => {
        clearInterval(relogioSugestoes);
        clearInterval(relogioEnvios);
      };
    },
  };
}
