import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

/*
  ============================================================================
  MARCO DE ATIVAÇÃO TEMPORAL (GOVERNANÇA DE ATENDIMENTO)
  
  Garante que o Vez apenas atenda mensagens que chegaram APÓS o operador
  ativar o agente no painel ou no terminal.
  
  Regras mandatórias:
  1. Processar somente mensagens recebidas >= marco_ativacao.
  2. Nunca responder retroativamente mensagens antigas da campanha ou dias anteriores.
  3. Não iniciar automaticamente atendimentos em conversas antigas.
  4. Modo de revisão: mensagens anteriores podem ser lidas e exibidas no painel,
     mas NUNCA disparam a IA nem enviam mensagem no WhatsApp.
  5. Sobrevivência a reinícios: o estado e timestamp são persistidos localmente
     e sincronizados com o banco Supabase.
  ============================================================================
*/

const ARQUIVO_ESTADO_MARCO = path.join(process.cwd(), ".marco_ativacao.json");

let estadoAtivacao = {
  agenteAtivo: true,
  ativadoEm: Date.now(),
  ativadoPor: "sistema",
  modoRevisaoApenas: false,
};

// Carrega estado persistido se existir
try {
  if (fs.existsSync(ARQUIVO_ESTADO_MARCO)) {
    const salvo = JSON.parse(fs.readFileSync(ARQUIVO_ESTADO_MARCO, "utf8"));
    if (salvo && typeof salvo.ativadoEm === "number") {
      estadoAtivacao = { ...estadoAtivacao, ...salvo };
    }
  }
} catch (e) {
  // Ignora falha de leitura e usa default
}

function salvarEstado() {
  try {
    fs.writeFileSync(ARQUIVO_ESTADO_MARCO, JSON.stringify(estadoAtivacao, null, 2), "utf8");
  } catch (e) {
    log.alerta(`[Marco Ativação] Não foi possível salvar estado local: ${e.message}`);
  }
}

/**
 * Ativa o agente com um novo marco temporal confiável (agora).
 */
export function ativarAgente(usuario = "operador", timestampMs = Date.now()) {
  estadoAtivacao = {
    agenteAtivo: true,
    ativadoEm: Number(timestampMs) || Date.now(),
    ativadoPor: usuario,
    modoRevisaoApenas: false,
  };
  salvarEstado();
  log.info(`[Agente] LIGADO por ${usuario} em ${new Date(estadoAtivacao.ativadoEm).toISOString()}.`);
  return { ...estadoAtivacao };
}

/**
 * Desativa o agente (modo de observação / pausa global).
 */
export function desativarAgente(usuario = "operador") {
  estadoAtivacao.agenteAtivo = false;
  estadoAtivacao.desativadoEm = Date.now();
  estadoAtivacao.desativadoPor = usuario;
  salvarEstado();
  log.info(`[Agente] PAUSADO globalmente por ${usuario}. Nenhuma resposta automática será enviada.`);
  return { ...estadoAtivacao };
}

/**
 * Retorna o estado atual da ativação e o marco temporal.
 */
export function obterEstadoAtivacao() {
  return { ...estadoAtivacao };
}

/**
 * Obtém o timestamp do marco de ativação em milissegundos.
 */
export function obterTimestampMarcoAtivacao() {
  return estadoAtivacao.ativadoEm;
}

/**
 * Valida se uma mensagem chegou após o marco de ativação e se o agente global está ativo.
 * 
 * @param {number|string|Date} timestampMensagem - Timestamp da mensagem (epoch ms, epoch s, ou ISO)
 * @returns {{ permitido: boolean, motivo?: string, timestampMensagemMs: number, marcoAtivacaoMs: number }}
 */
export function validarLimiteTemporalMensagem(timestampMensagem) {
  if (!estadoAtivacao.agenteAtivo) {
    return {
      permitido: false,
      motivo: "agente_global_desativado",
      timestampMensagemMs: 0,
      marcoAtivacaoMs: estadoAtivacao.ativadoEm,
    };
  }

  let msgMs = 0;
  if (typeof timestampMensagem === "number") {
    // Se estiver em segundos (comum no WhatsApp Web/Evolution: ex. 1730550000), converte para ms
    msgMs = timestampMensagem < 10_000_000_000 ? timestampMensagem * 1000 : timestampMensagem;
  } else if (timestampMensagem instanceof Date) {
    msgMs = timestampMensagem.getTime();
  } else if (typeof timestampMensagem === "string") {
    const parsed = Date.parse(timestampMensagem);
    msgMs = isNaN(parsed) ? 0 : parsed;
  }

  // Tolerância de 15 segundos para compensar pequeno skew de relógio entre cliente e servidor
  const TOLERANCIA_SKEW_MS = 15_000;
  const marcoComMargem = estadoAtivacao.ativadoEm - TOLERANCIA_SKEW_MS;

  if (msgMs < marcoComMargem) {
    return {
      permitido: false,
      motivo: "mensagem_anterior_ao_marco_de_ativacao",
      timestampMensagemMs: msgMs,
      marcoAtivacaoMs: estadoAtivacao.ativadoEm,
      dataMensagem: new Date(msgMs).toISOString(),
      dataAtivacao: new Date(estadoAtivacao.ativadoEm).toISOString(),
    };
  }

  return {
    permitido: true,
    timestampMensagemMs: msgMs,
    marcoAtivacaoMs: estadoAtivacao.ativadoEm,
  };
}

/**
 * Reseta o marco temporal para fins de teste.
 */
export function resetarMarcoParaTestes(novoEstado = {}) {
  estadoAtivacao = {
    agenteAtivo: true,
    ativadoEm: Date.now(),
    ativadoPor: "teste",
    modoRevisaoApenas: false,
    ...novoEstado,
  };
  salvarEstado();
}
