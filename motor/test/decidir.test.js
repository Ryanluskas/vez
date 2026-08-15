import test from "node:test";
import assert from "node:assert/strict";
import {
  decidir,
  podeAgirSozinho,
  ACOES,
  LIMIAR_ASSISTIDO,
} from "../src/agente/decidir.js";
import { validarDecisao, validarTexto } from "../src/agente/validar.js";

/*
  A decisão é a peça onde um erro custa mais caro: ela escolhe entre falar
  com o cliente, incomodar o consultor e ficar quieta. Por ser função pura,
  dá pra cobrir todos os caminhos aqui em vez de descobrir em produção.
*/

const confirmado = { confirmado: true, como: "cliente" };

function retrato(extra = {}) {
  return {
    conversa: { atender: true, estagio: "aguardando_bot" },
    memoria: { convenio: null, banco: null, coletado: {}, perguntado: {} },
    classificacao: {
      categoria: "saudacao",
      precisaDoRyan: false,
      motivo: null,
      decidiuNaRegra: false,
    },
    ultimasMensagens: [],
    ...extra,
  };
}

const memoriaCompleta = {
  convenio: "inss",
  banco: "Santander",
  coletado: { contracheque: confirmado, margem: confirmado },
  perguntado: {},
};

/* ---------------------------------------------------------------- estado */

test("contato silenciado não é atendido", () => {
  const d = decidir(retrato({ conversa: { atender: false } }));
  assert.equal(d.acao, ACOES.SILENCIAR);
});

test("conversa esperando o consultor não recebe resposta do bot", () => {
  const d = decidir(retrato({ conversa: { atender: true, estagio: "aguardando_voce" } }));
  assert.equal(d.acao, ACOES.AGUARDAR);
});

test("pendência aberta segura o bot mesmo com estágio normal", () => {
  const d = decidir(
    retrato({ conversa: { atender: true, estagio: "aguardando_bot", temPendenciaAberta: true } })
  );
  assert.equal(d.acao, ACOES.AGUARDAR);
});

/* --------------------------------------------------------------- dinheiro */

test("pergunta de valor SEM documentos vira pedido ao cliente, não fila", () => {
  const d = decidir(
    retrato({
      classificacao: {
        categoria: "valor",
        precisaDoRyan: true,
        motivo: "perguntou quanto libera",
        decidiuNaRegra: true,
      },
    })
  );

  assert.equal(d.acao, ACOES.PERGUNTAR_CLIENTE);
  assert.equal(d.confianca, 1, "regra rígida é decisão determinística");
  assert.ok(d.pedido.chaves.length > 0);
});

test("pergunta de valor COM tudo coletado vai pro consultor", () => {
  const d = decidir(
    retrato({
      memoria: memoriaCompleta,
      classificacao: {
        categoria: "valor",
        precisaDoRyan: true,
        motivo: "perguntou quanto libera",
        decidiuNaRegra: true,
      },
    })
  );

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "valor");
  assert.equal(d.tudoColetado, true);
});

test("valor nunca sai sozinho, em modo nenhum", () => {
  const decisao = { acao: ACOES.RESPONDER, categoria: "valor", confianca: 1 };
  for (const modo of ["manual", "assistido", "autonomo"]) {
    assert.equal(
      podeAgirSozinho(decisao, { modo, categoriasLiberadas: ["valor", "saudacao"] }),
      false,
      `vazou no modo ${modo}`
    );
  }
});

/* -------------------------------------------------------------- anti-loop */

test("três mensagens seguidas sem resposta escalam pro consultor", () => {
  const d = decidir(
    retrato({
      ultimasMensagens: [
        { direcao: "recebida" },
        { direcao: "enviada" },
        { direcao: "enviada" },
        { direcao: "enviada" },
      ],
    })
  );

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "sem_resposta");
});

test("duas seguidas ainda deixam o bot trabalhar", () => {
  const d = decidir(
    retrato({ ultimasMensagens: [{ direcao: "enviada" }, { direcao: "enviada" }] })
  );
  assert.equal(d.acao, ACOES.RESPONDER);
});

test("resposta do cliente zera o monólogo", () => {
  const d = decidir(
    retrato({
      ultimasMensagens: [
        { direcao: "enviada" },
        { direcao: "enviada" },
        { direcao: "enviada" },
        { direcao: "recebida" },
      ],
    })
  );
  assert.equal(d.acao, ACOES.RESPONDER);
});

/* ------------------------------------------------------------------ modos */

test("modo manual nunca age sozinho", () => {
  const d = decidir(retrato());
  assert.equal(
    podeAgirSozinho(d, { modo: "manual", categoriasLiberadas: ["saudacao"] }),
    false
  );
});

test("assistido só age com confiança alta", () => {
  const alta = { acao: ACOES.RESPONDER, categoria: "saudacao", confianca: 0.8 };
  const baixa = { acao: ACOES.RESPONDER, categoria: "outro", confianca: 0.5 };
  const opcoes = { modo: "assistido", categoriasLiberadas: ["saudacao", "outro"] };

  assert.equal(podeAgirSozinho(alta, opcoes), true);
  assert.equal(podeAgirSozinho(baixa, opcoes), false);
  assert.ok(LIMIAR_ASSISTIDO <= 0.8);
});

test("autônomo age mesmo com confiança baixa, se a categoria estiver liberada", () => {
  const baixa = { acao: ACOES.RESPONDER, categoria: "outro", confianca: 0.5 };
  assert.equal(
    podeAgirSozinho(baixa, { modo: "autonomo", categoriasLiberadas: ["outro"] }),
    true
  );
  assert.equal(
    podeAgirSozinho(baixa, { modo: "autonomo", categoriasLiberadas: ["saudacao"] }),
    false,
    "categoria não liberada não sai nem no autônomo"
  );
});

/* -------------------------------------------------------------- validador */

test("toda decisão produzida é válida", () => {
  const casos = [
    retrato(),
    retrato({ conversa: { atender: false } }),
    retrato({ classificacao: { categoria: "valor", precisaDoRyan: true, motivo: "x", decidiuNaRegra: true } }),
    retrato({ memoria: memoriaCompleta, classificacao: { categoria: "valor", precisaDoRyan: true, motivo: "x", decidiuNaRegra: true } }),
    retrato({ classificacao: null }),
  ];

  for (const caso of casos) {
    const d = decidir(caso);
    const v = validarDecisao(d);
    assert.equal(v.ok, true, `decisão inválida: ${v.problemas?.join(", ")}`);
  }
});

test("validador barra decisão malformada", () => {
  assert.equal(validarDecisao(null).ok, false);
  assert.equal(validarDecisao({ acao: "inventada", confianca: 1, motivo: "x" }).ok, false);
  assert.equal(
    validarDecisao({ acao: ACOES.PERGUNTAR_CLIENTE, confianca: 1, motivo: "x" }).ok,
    false,
    "pedido sem conteúdo viraria mensagem vazia"
  );
});

/* ---------------------------------------------------------- texto que sai */

test("texto com número inventado não sai", () => {
  const r = validarTexto("Consegui liberar R$ 8.410,00 pra você!", {
    permitirNumeros: true,
    fontesPermitidas: ["R$ 6.240,00, em 84x de 210"],
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /inventou/);
});

test("texto usando só os números do consultor passa", () => {
  const r = validarTexto(
    "Marlene, consegui liberar R$ 6.240,00 pra você, em 84x de R$ 210. Quer a simulação?",
    { permitirNumeros: true, fontesPermitidas: ["R$ 6.240,00, em 84x de 210"] }
  );
  assert.equal(r.ok, true, r.motivo);
});

test("sem dado do consultor, texto não pode falar de dinheiro", () => {
  const r = validarTexto("Sua parcela vai ficar bem tranquila, pode confiar!", {});
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('"não sei" e marcador vazado não saem', () => {
  assert.equal(validarTexto("Não sei te dizer isso agora", {}).ok, false);
  assert.equal(validarTexto("Consegui liberar R$ VALOR pra você hoje", {}).ok, false);
  assert.equal(validarTexto("ok", {}).ok, false);
});

test("pedido de documento passa — é pergunta, não valor", () => {
  const r = validarTexto(
    "Oi Josenete! Pra eu conseguir te dar esse número, me manda seu contracheque atualizado?",
    {}
  );
  assert.equal(r.ok, true, r.motivo);
});
