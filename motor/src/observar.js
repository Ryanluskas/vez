import { log } from "./log.js";

/*
  ============================================================================
  O DIÁRIO DO AGENTE

  Uma linha por coisa que aconteceu, na ordem em que aconteceu. Serve pra
  responder a pergunta que hoje não tem resposta: "por que o bot fez isso
  ontem às 14h?".

  O log do terminal não serve pra isso. Ele rola pra cima, some quando o
  consultor fecha a janela, e não existe mais quando o problema aparece
  dois dias depois — que é sempre quando ele aparece.

  O QUE NUNCA ENTRA AQUI

    - valor, parcela, taxa, saldo, margem
    - chave, token, senha, URL com credencial
    - o texto completo da conversa

  Argumento de ferramenta passa por uma peneira antes de ser gravado. Não
  porque eu desconfie do código que chama — porque um diário que guarda
  segredo vira o próprio vazamento no dia em que alguém exporta a tabela.
  ============================================================================
*/

export const EVENTOS = {
  RECEBIDA: "mensagem_recebida",
  CLASSIFICOU: "classificacao",
  DECIDIU: "decisao",
  FERRAMENTA: "ferramenta",
  ESCREVEU: "resposta_gerada",
  VALIDOU: "validacao",
  ENVIADA: "mensagem_enviada",
  HANDOFF: "handoff",
  CONSULTOR: "resposta_do_consultor",
  MEMORIA: "memoria",
  FUNIL: "funil",
  SEGUIMENTO: "followup",
  ERRO: "erro",
  RETENTATIVA: "retry",
};

/*
  Os rótulos em português vivem no painel (components/painel/LinhaDoTempo),
  não aqui. O motor grava o tipo cru; quem lê é que decide como chamar.
  Duplicar a tradução nos dois lados só criaria duas versões pra manter.
*/

/*
  A peneira. Só passa o que é seguro guardar: nada de dinheiro, nada de
  segredo, nada de texto longo.
*/
const CHAVES_PROIBIDAS =
  /senha|token|chave|key|secret|authorization|bearer|cookie|credential|apikey/i;

const VALOR_SUSPEITO =
  /\b(?:sb_secret_|gsk_|sk-|eyJ[A-Za-z0-9_-]{10,})|https?:\/\/[^\s]*[?&](?:key|token|apikey)=/i;

const TAMANHO_MAXIMO = 200;

export function peneirar(argumentos) {
  if (!argumentos || typeof argumentos !== "object") return {};

  const limpo = {};
  for (const [chave, valor] of Object.entries(argumentos)) {
    if (CHAVES_PROIBIDAS.test(chave)) {
      limpo[chave] = "[escondido]";
      continue;
    }

    if (typeof valor === "string") {
      if (VALOR_SUSPEITO.test(valor)) {
        limpo[chave] = "[escondido]";
        continue;
      }
      limpo[chave] =
        valor.length > TAMANHO_MAXIMO ? `${valor.slice(0, TAMANHO_MAXIMO)}…` : valor;
      continue;
    }

    if (typeof valor === "number" || typeof valor === "boolean" || valor === null) {
      limpo[chave] = valor;
      continue;
    }

    // Objeto aninhado vira resumo: o diário é pra ler, não pra despejar.
    if (Array.isArray(valor)) {
      limpo[chave] = `${valor.length} item(ns)`;
      continue;
    }

    limpo[chave] = "[objeto]";
  }

  return limpo;
}

export function criarObservador({ supabase, userId }) {
  /*
    A gravação não pode segurar o atendimento. Cada evento vai numa fila e
    é despejado em lote — o cliente nunca espera o diário.
  */
  const fila = [];
  let escoando = false;

  async function escoar() {
    if (escoando || fila.length === 0) return;
    escoando = true;

    const lote = fila.splice(0, 50);
    try {
      await supabase.from("acoes_do_agente").insert(lote);
    } catch {
      /* tabela ainda não criada, ou banco fora: o diário é o que menos
         importa neste momento. Nada de retry — encheria a memória. */
    } finally {
      escoando = false;
      if (fila.length) setTimeout(escoar, 50).unref?.();
    }
  }

  function registrar(tipo, dados = {}) {
    const {
      idConversa = null,
      idMensagem = null,
      idPendencia = null,
      idRascunho = null,
      idOperacao = null,
      ferramenta = null,
      argumentos = null,
      detalhe = null,
      ok = true,
      ms = null,
    } = dados;

    const argsComCorrelacao = {
      ...(argumentos && typeof argumentos === "object" ? argumentos : {}),
      ...(idMensagem ? { id_mensagem: idMensagem } : {}),
      ...(idPendencia ? { id_pendencia: idPendencia } : {}),
      ...(idRascunho ? { id_rascunho: idRascunho } : {}),
      ...(idOperacao ? { id_operacao: idOperacao } : {}),
    };

    fila.push({
      user_id: userId,
      id_conversa: idConversa,
      tipo,
      ferramenta,
      argumentos: peneirar(argsComCorrelacao),
      // Detalhe é uma frase curta pro consultor ler, nunca um dump.
      detalhe: detalhe ? String(detalhe).slice(0, 300) : null,
      ok,
      erro: ok ? null : String(detalhe ?? "").slice(0, 300) || "erro",
      ms,
    });

    setTimeout(escoar, 0).unref?.();
  }

  return {
    registrar,

    /* Espera o que está na fila sair. Usado no encerramento do motor. */
    async terminar() {
      while (fila.length) {
        await escoar();
        if (escoando) await new Promise((r) => setTimeout(r, 20));
      }
    },
  };
}

/*
  Observador de mentira, pra quando não há Supabase (testes, boot antes do
  login). Mesma interface: quem usa não precisa saber a diferença.
*/
export function observadorMudo() {
  return { registrar() {}, async terminar() {} };
}

export { log };
