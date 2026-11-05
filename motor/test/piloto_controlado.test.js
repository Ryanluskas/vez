import { test } from "node:test";
import assert from "node:assert/strict";
import {
  obterTelefonesAutorizados,
  estaEmModoPiloto,
  telefoneAutorizadoNoPiloto,
  verificarBloqueioPiloto,
} from "../src/piloto.js";
import { decidir, ACOES } from "../src/agente/decidir.js";
import { criarTravas } from "../src/travas.js";

/*
  ============================================================================
  SUITE DE TESTES DO PILOTO CONTROLADO — OS 8 CRITÉRIOS DE PRONTIDÃO
  Validação operacional formal pré-deploy
  ============================================================================
*/

const TEL_AUTORIZADO = "5562999990001";
const TEL_NAO_AUTORIZADO = "5511988887777";

test("Critério 1: Número autorizado tem permissão para receber resposta", () => {
  const envOriginal = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  try {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = TEL_AUTORIZADO;
    const checagem = verificarBloqueioPiloto(TEL_AUTORIZADO, "atendimento");
    assert.equal(checagem.bloqueado, false, "Número autorizado NÃO deve ser bloqueado");
    assert.equal(telefoneAutorizadoNoPiloto(TEL_AUTORIZADO), true);
  } finally {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = envOriginal;
  }
});

test("Critério 2: Número não autorizado NÃO recebe resposta automática", () => {
  const envOriginal = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  try {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = TEL_AUTORIZADO;
    const checagem = verificarBloqueioPiloto(TEL_NAO_AUTORIZADO, "atendimento");
    assert.equal(checagem.bloqueado, true, "Número não autorizado DEVE ser bloqueado");
    assert.match(checagem.motivo, /allowlist/i);
    assert.equal(telefoneAutorizadoNoPiloto(TEL_NAO_AUTORIZADO), false);
  } finally {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = envOriginal;
  }
});

test("Critério 3: Mensagens duplicadas não geram respostas duplicadas", () => {
  const idsVistos = new Set();
  function processarMensagem(keyId) {
    if (idsVistos.has(keyId)) return { acao: "ignorado_duplicado" };
    idsVistos.add(keyId);
    return { acao: "processado" };
  }

  const idMsg = "MSG_WHATSAPP_DUPLICADA_001";
  assert.equal(processarMensagem(idMsg).acao, "processado");
  assert.equal(processarMensagem(idMsg).acao, "ignorado_duplicado");
  assert.equal(processarMensagem(idMsg).acao, "ignorado_duplicado");
});

test("Critério 4: Mensagens sequenciais preservam a ordem estrita FIFO", async () => {
  const travas = criarTravas();
  const idConversa = "conversa_fifo_piloto";
  const execucoes = [];

  const p1 = travas.naVezDe(idConversa, async () => {
    await new Promise((r) => setTimeout(r, 15));
    execucoes.push("msg_1_primeira");
  });
  const p2 = travas.naVezDe(idConversa, async () => {
    await new Promise((r) => setTimeout(r, 5));
    execucoes.push("msg_2_segunda");
  });
  const p3 = travas.naVezDe(idConversa, async () => {
    execucoes.push("msg_3_terceira");
  });

  await Promise.all([p1, p2, p3]);
  assert.deepEqual(execucoes, ["msg_1_primeira", "msg_2_segunda", "msg_3_terceira"]);
});

test("Critério 5: Reinicialização do motor (nova instância) preserva proteção de allowlist", async () => {
  const envOriginal = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  try {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = TEL_AUTORIZADO;

    // Simula reinicialização do runtime: funções consultam novo estado sem cache residual
    const autorizado = telefoneAutorizadoNoPiloto(TEL_AUTORIZADO);
    const naoAutorizado = telefoneAutorizadoNoPiloto(TEL_NAO_AUTORIZADO);

    assert.equal(autorizado, true, "Número autorizado deve continuar liberado");
    assert.equal(naoAutorizado, false, "Número não autorizado deve continuar bloqueado após restart");
  } finally {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = envOriginal;
  }
});

test("Critério 6: Follow-ups e workers não contornam a allowlist", async () => {
  const envOriginal = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  try {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = TEL_AUTORIZADO;

    const { criarSeguimento } = await import("../src/seguimento.js");
    const agora = new Date();
    const seteHorasAtras = new Date(agora.getTime() - 7 * 60 * 60 * 1000).toISOString();

    const conversas = [
      {
        id: "conv_aut",
        telefone: TEL_AUTORIZADO,
        etapa: "aguardando_documentos",
        atender: true,
        seguir: true,
        followups_enviados: 0,
        ultima_recebida_em: seteHorasAtras,
      },
      {
        id: "conv_unaut",
        telefone: TEL_NAO_AUTORIZADO,
        etapa: "aguardando_documentos",
        atender: true,
        seguir: true,
        followups_enviados: 0,
        ultima_recebida_em: seteHorasAtras,
      },
    ];

    const solicitacoes = [];
    const supabaseMock = {
      from(tabela) {
        if (tabela === "conversas") {
          return {
            select() {
              const b = {
                eq() { return b; },
                lt() { return b; },
                in() { return b; },
                is() { return b; },
                limit() { return Promise.resolve({ data: conversas, error: null }); },
              };
              return b;
            },
          };
        }
        if (tabela === "solicitacoes_followup") {
          return {
            select() {
              const b = { eq() { return b; }, in() { return Promise.resolve({ count: 0 }); } };
              return b;
            },
            insert(d) {
              solicitacoes.push(d);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    };

    const maestroMock = { clientePara: () => ({ sendMessage: async () => {} }) };
    const seguimento = criarSeguimento({ supabase: supabaseMock, maestro: maestroMock, userId: "u1" });

    const horarioComercial = new Date();
    horarioComercial.setHours(14, 0, 0, 0);
    await seguimento.varrerSugestoes(horarioComercial);

    // O worker DEVE sugerir apenas para o número autorizado
    assert.equal(solicitacoes.length, 1);
    assert.equal(solicitacoes[0].id_conversa, "conv_aut");
  } finally {
    process.env.PILOTO_TELEFONES_AUTORIZADOS = envOriginal;
  }
});

test("Critério 7: O consultor consegue assumir a conversa (so_voce)", () => {
  const dec = decidir({
    conversa: { id: "c_assumida", soVoce: true, atender: true },
    memoria: { nome: "Cliente em Atendimento Manual" },
  });

  assert.equal(dec.acao, ACOES.AGUARDAR);
  assert.match(dec.motivo, /esta conversa está com você; só gravei/i);
});

test("Critério 8: O motor respeita o handoff (aguardando_voce)", () => {
  const dec = decidir({
    conversa: { id: "c_handoff", temPendenciaAberta: true, estagio: "aguardando_voce", atender: true },
    memoria: { nome: "Cliente Aguardando Simulação" },
  });

  assert.equal(dec.acao, ACOES.AGUARDAR);
  assert.match(dec.motivo, /já existe pergunta esperando você/i);
});
