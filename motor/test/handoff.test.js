import test from "node:test";
import assert from "node:assert/strict";
import { decidir, ACOES } from "../src/agente/decidir.js";
import { validarTexto } from "../src/agente/validar.js";

/*
  O ciclo que a Fase 6 fecha:

    CLIENTE → AGENTE → CONSULTOR → AGENTE → CLIENTE

  O que estes testes protegem é o pedaço perigoso dele: o consultor responde
  "4200 em 12x de 380" e esse texto vira mensagem pro cliente SEM segunda
  aprovação. Se a IA acrescentar um número ali, ninguém está olhando.
*/

const confirmado = { confirmado: true, como: "cliente" };

function retrato(extra = {}) {
  return {
    conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 0 },
    memoria: {
      convenio: "inss",
      banco: "Santander",
      coletado: { contracheque: confirmado, margem: confirmado },
      perguntado: {},
    },
    classificacao: {
      categoria: "valor",
      precisaDoRyan: true,
      motivo: "perguntou quanto libera",
      decidiuNaRegra: true,
    },
    ultimasMensagens: [],
    ...extra,
  };
}

/* ------------------------------------------------------------- o handoff */

test("com tudo coletado, a pergunta de valor vira handoff", () => {
  const d = decidir(retrato());
  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "valor");
  assert.equal(d.tudoColetado, true, "o consultor só entra quando só ele resolve");
});

/* --------------------------------------------- resposta curta do consultor */

test("resposta curta do consultor vira mensagem sem inventar nada", () => {
  const doConsultor = "4200 em 12x de 380";
  const pergunta = "quanto eu consigo?";

  const escrita =
    "Josenete, consegui liberar 4200 pra você, em 12x de 380. Quer que eu mande a simulação completa?";

  const r = validarTexto(escrita, {
    permitirNumeros: true,
    fontesPermitidas: [doConsultor, pergunta],
  });

  assert.equal(r.ok, true, r.motivo);
});

test("se a IA arredondar o número do consultor, a mensagem não sai", () => {
  const doConsultor = "4200 em 12x de 380";

  // 4.200 vira "4 mil" — parece inofensivo e é exatamente o erro que
  // transforma uma proposta em reclamação.
  const r = validarTexto(
    "Consegui uns 4500 pra você, em 12x de 380. Fechamos?",
    { permitirNumeros: true, fontesPermitidas: [doConsultor] }
  );

  assert.equal(r.ok, false);
  assert.match(r.motivo, /inventou/);
});

test("a IA não pode acrescentar taxa que o consultor não deu", () => {
  const r = validarTexto(
    "São 4200 em 12x de 380, com taxa de 1,49% ao mês. Pode ser?",
    { permitirNumeros: true, fontesPermitidas: ["4200 em 12x de 380"] }
  );

  assert.equal(r.ok, false, "1,49 não veio de lugar nenhum");
});

test("formato diferente do mesmo número passa", () => {
  // O consultor escreve "4200"; a IA formata "R$ 4.200,00". É o mesmo valor.
  const r = validarTexto(
    "Consegui R$ 4.200,00 pra você, em 12x de R$ 380,00. Quer a simulação?",
    { permitirNumeros: true, fontesPermitidas: ["4200 em 12x de 380"] }
  );

  assert.equal(r.ok, true, r.motivo);
});

/* --------------------------------------------------- retomada e continuação */

test("depois de responder, a conversa volta a ser do bot", () => {
  // Estágio já saiu de 'aguardando_voce' e não há mais pendência aberta.
  const d = decidir(
    retrato({
      conversa: { atender: true, estagio: "respondido", escalonamentos: 0 },
      classificacao: {
        categoria: "saudacao",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.RESPONDER, "o agente retoma sozinho");
});

test("enquanto você não responde, o bot não fala com aquele cliente", () => {
  const d = decidir(
    retrato({
      conversa: {
        atender: true,
        estagio: "aguardando_voce",
        temPendenciaAberta: true,
        escalonamentos: 1,
      },
    })
  );
  assert.equal(d.acao, ACOES.AGUARDAR);
});

/* -------------------------------------------------------- proteção de loop */

test("três idas e voltas sem resolver: o bot entrega a conversa", () => {
  const d = decidir(
    retrato({
      conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 3 },
    })
  );

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "loop");
  assert.equal(d.assumirManual, true);
});

test("conversa assumida por você: o bot não decide mais nada ali", () => {
  const d = decidir(
    retrato({
      conversa: {
        atender: true,
        estagio: "aguardando_bot",
        soVoce: true,
        escalonamentos: 3,
      },
      classificacao: {
        categoria: "saudacao",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.AGUARDAR, "assumida não é conversa pra responder");
});

test("assumida vence até o que o bot saberia responder", () => {
  // Sem a trava, "bom dia" reabriria a conversa e o bot voltaria a decidir
  // um caso que já provou que ele não resolve.
  const d = decidir(
    retrato({
      conversa: { atender: true, estagio: "respondido", soVoce: true, escalonamentos: 0 },
      classificacao: {
        categoria: "horario",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.AGUARDAR);
});

test("devolvida ao bot, a conversa volta a andar", () => {
  // É o que o botão "Devolver ao bot" faz: so_voce=false e contador zerado.
  const d = decidir(
    retrato({
      conversa: {
        atender: true,
        estagio: "respondido",
        soVoce: false,
        escalonamentos: 0,
      },
      classificacao: {
        categoria: "horario",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.RESPONDER);
});

test("duas idas ainda deixam o bot tentar", () => {
  const d = decidir(
    retrato({
      conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 2 },
      classificacao: {
        categoria: "saudacao",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.RESPONDER);
});

/* ------------------------------------------------ vários clientes ao mesmo tempo */

test("uma conversa travada não trava as outras", () => {
  const travada = decidir(
    retrato({
      conversa: {
        atender: true,
        estagio: "aguardando_voce",
        temPendenciaAberta: true,
        escalonamentos: 1,
      },
    })
  );

  const outros = ["Bruna", "Carlos", "Diego", "Elaine"].map(() =>
    decidir(
      retrato({
        conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 0 },
        classificacao: {
          categoria: "documentos",
          precisaDoRyan: false,
          motivo: null,
          decidiuNaRegra: false,
        },
      })
    )
  );

  assert.equal(travada.acao, ACOES.AGUARDAR);
  for (const d of outros) {
    assert.equal(d.acao, ACOES.RESPONDER, "cliente B parou por causa do A");
  }
});

test("a decisão de um cliente não vaza pro outro", () => {
  // A mesma função, chamada em sequência com retratos diferentes, não pode
  // guardar estado entre chamadas. É o que garante o paralelismo.
  const comValor = decidir(retrato());
  const semValor = decidir(
    retrato({
      classificacao: {
        categoria: "horario",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );
  const comValorDeNovo = decidir(retrato());

  assert.equal(comValor.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(semValor.acao, ACOES.RESPONDER);
  assert.deepEqual(
    comValorDeNovo.acao,
    comValor.acao,
    "a chamada do meio contaminou a terceira"
  );
});
