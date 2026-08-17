import test from "node:test";
import assert from "node:assert/strict";
import { decidir, podeAgirSozinho, ACOES } from "../src/agente/decidir.js";
import { validarDecisao, validarAntesDeEnviar } from "../src/agente/validar.js";
import { montarPedido, prontoPara } from "../src/requisitos.js";
import { checarGatilhos } from "../src/gatilhos.js";

/*
  ============================================================================
  O FLUXO INTEIRO, PASSO A PASSO

  Os outros arquivos testam cada peça. Este testa a montagem: dada uma
  mensagem de cliente, o agente atravessa as etapas certas e chega no lugar
  certo.

  São os três caminhos que o produto promete:

    1. o bot resolve         → decide, escreve, valida, envia
    2. falta do cliente      → pergunta só o que falta, memória atualiza,
                               o agente continua
    3. falta do consultor    → handoff, consultor responde, valida,
                               cliente recebe, agente continua sozinho
  ============================================================================
*/

const confirmado = { confirmado: true, como: "cliente" };

function memoriaCompleta(extra = {}) {
  return {
    nome: "Antonio",
    convenio: "inss",
    banco: "Santander",
    coletado: { contracheque: confirmado, margem: confirmado },
    perguntado: {},
    ...extra,
  };
}

function retrato({ mensagem, memoria = null, conversa = {}, classificacao = null }) {
  /*
    A classificação de verdade passa pelo Ollama. Aqui ela é derivada da
    regra rígida — que é justamente o caminho que NÃO depende de modelo, e
    o único que precisa estar certo em 100% dos casos.
  */
  const gatilho = checarGatilhos(mensagem);

  return {
    conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 0, ...conversa },
    memoria,
    classificacao:
      classificacao ?? {
        categoria: gatilho.travou ? "valor" : "duvida",
        precisaDoRyan: gatilho.travou,
        motivo: gatilho.motivo,
        decidiuNaRegra: gatilho.travou,
      },
    ultimasMensagens: [],
  };
}

/* ================================================================
   Caminho 1 — o bot resolve sozinho
   ================================================================ */

test("pergunta simples: decide responder e a decisão é válida", () => {
  const d = decidir(retrato({ mensagem: "vocês atendem no sábado?" }));

  assert.equal(d.acao, ACOES.RESPONDER);
  assert.equal(validarDecisao(d).ok, true);
});

test("a resposta escrita passa pela porta e pode sair", () => {
  const texto = "Antonio, atendo de segunda a sexta, das 8h às 18h. Quer que eu já adiante seu caso?";

  const porta = validarAntesDeEnviar(texto, {
    manual: "Horário: atendo de segunda a sexta, das 8h às 18h.",
    memoria: memoriaCompleta(),
    nomeCliente: "Antonio",
    mensagemCliente: "vocês atendem no sábado?",
  });

  assert.equal(porta.ok, true, porta.motivo);
});

test("modo autônomo com a categoria liberada: sai sem passar por você", () => {
  const d = decidir(retrato({ mensagem: "vocês atendem no sábado?" }));

  assert.equal(
    podeAgirSozinho(d, { modo: "autonomo", categoriasLiberadas: ["duvida"] }),
    true
  );
});

test("nem em modo autônomo a categoria valor sai sozinha", () => {
  const decisaoDeValor = { categoria: "valor", confianca: 1 };

  assert.equal(
    podeAgirSozinho(decisaoDeValor, {
      modo: "autonomo",
      categoriasLiberadas: ["valor", "duvida"],
    }),
    false,
    "a quarta barreira caiu"
  );
});

/* ================================================================
   Caminho 2 — falta informação do CLIENTE
   ================================================================ */

test("cliente novo perguntando de valor: pergunta o que falta, não chama você", () => {
  const d = decidir(retrato({ mensagem: "quanto eu consigo de empréstimo?", memoria: null }));

  assert.equal(d.acao, ACOES.PERGUNTAR_CLIENTE);
  assert.equal(validarDecisao(d).ok, true);
  assert.ok(d.pedido.chaves.length <= 2, "não vira formulário");
});

test("o pedido não contém número nenhum — não fura a regra de ouro", () => {
  const d = decidir(retrato({ mensagem: "quanto libera?", memoria: null }));

  const porta = validarAntesDeEnviar(
    `Oi! Pra eu conseguir te responder, ${d.pedido.texto}. Pode ser?`,
    { memoria: null, mensagemCliente: "quanto libera?" }
  );

  assert.equal(porta.ok, true, porta.motivo);
});

test("o cliente responde e a memória avança: o próximo pedido é outro", () => {
  const antes = montarPedido(null);
  const depois = montarPedido({ convenio: "inss", banco: "Santander", coletado: {} });

  assert.notDeepEqual(antes.chaves, depois.chaves, "ia pedir a mesma coisa de novo");
  assert.equal(depois.chaves.includes("convenio"), false);
});

test("com tudo na mão, para de perguntar e libera a simulação", () => {
  const m = memoriaCompleta();
  assert.equal(montarPedido(m), null);
  assert.equal(prontoPara(m), true);
});

test("perguntou duas vezes e o cliente não respondeu: o caso vira seu", () => {
  const teimoso = memoriaCompleta({
    coletado: {},
    perguntado: {
      contracheque: { vezes: 2 },
      margem: { vezes: 2 },
    },
  });

  const d = decidir(retrato({ mensagem: "e aí, quanto sai?", memoria: teimoso }));

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR, "insistir na terceira traz bloqueio, não documento");
});

/* ================================================================
   Caminho 3 — falta informação do CONSULTOR
   ================================================================ */

test("tudo coletado + pergunta de valor: handoff", () => {
  const d = decidir(retrato({ mensagem: "quanto libera pra mim?", memoria: memoriaCompleta() }));

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "valor");
  assert.equal(d.tudoColetado, true);
  assert.equal(d.confianca, 1, "veio de regra rígida, não de palpite do modelo");
});

test("enquanto você não responde, o bot não fala com aquele cliente", () => {
  const d = decidir(
    retrato({
      mensagem: "oi, alguma novidade?",
      memoria: memoriaCompleta(),
      conversa: { estagio: "aguardando_voce", temPendenciaAberta: true },
    })
  );

  assert.equal(d.acao, ACOES.AGUARDAR);
});

test("a resposta do consultor vira mensagem, com os números dele e só os dele", () => {
  const doConsultor = "4200 em 12x de 380";

  const boa = validarAntesDeEnviar(
    "Antonio, consegui 4200 pra você, em 12x de 380. Quer que eu já mande a simulação?",
    {
      permitirNumeros: true,
      fontesPermitidas: [doConsultor, "quanto libera pra mim?"],
      memoria: memoriaCompleta(),
      nomeCliente: "Antonio",
    }
  );
  assert.equal(boa.ok, true, boa.motivo);

  const ruim = validarAntesDeEnviar(
    "Antonio, consegui 4200 em 12x de 380, com taxa de 1,49% ao mês. Fechamos?",
    {
      permitirNumeros: true,
      fontesPermitidas: [doConsultor],
      memoria: memoriaCompleta(),
      nomeCliente: "Antonio",
    }
  );
  assert.equal(ruim.ok, false, "a taxa não veio de lugar nenhum");
});

test("depois de você responder, o agente volta a andar sozinho", () => {
  const d = decidir(
    retrato({
      mensagem: "beleza, e quanto tempo demora?",
      memoria: memoriaCompleta(),
      conversa: { estagio: "respondido", escalonamentos: 0 },
      classificacao: {
        categoria: "prazo",
        precisaDoRyan: false,
        motivo: null,
        decidiuNaRegra: false,
      },
    })
  );

  assert.equal(d.acao, ACOES.RESPONDER, "o consultor teria que responder tudo de novo");
});

/* ================================================================
   O que nunca pode acontecer
   ================================================================ */

test("nenhuma pergunta de dinheiro vira resposta automática", () => {
  const perguntas = [
    "quanto eu consigo?",
    "qual vai ser a parcela?",
    "me faz uma simulação",
    "quanto tá a taxa hoje?",
    "qual meu saldo devedor?",
    "quanto sobra da minha margem?",
    "dá pra liberar uns 5 mil?",
  ];

  for (const p of perguntas) {
    const d = decidir(retrato({ mensagem: p, memoria: memoriaCompleta() }));
    assert.equal(
      d.acao,
      ACOES.PEDIR_AO_CONSULTOR,
      `"${p}" não foi parar na sua mão — foi ${d.acao}`
    );
  }
});

test("decisão malformada nunca é executada", () => {
  assert.equal(validarDecisao(null).ok, false);
  assert.equal(validarDecisao({ acao: "mandar_pix", confianca: 1, motivo: "x" }).ok, false);
  assert.equal(validarDecisao({ acao: ACOES.RESPONDER, confianca: 7, motivo: "x" }).ok, false);
  assert.equal(validarDecisao({ acao: ACOES.PERGUNTAR_CLIENTE, confianca: 1, motivo: "x" }).ok, false);
});
