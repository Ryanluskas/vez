import test from "node:test";
import assert from "node:assert/strict";
import {
  queFalta,
  montarPedido,
  prontoPara,
  quantasVezesPerguntei,
} from "../src/requisitos.js";

/*
  Perguntas mínimas é a parte que o cliente SENTE. Bot que repergunta o que
  já foi respondido convence o cliente de que não tem ninguém prestando
  atenção — e aí ele some. Daí o teste ser sobre comportamento, não sobre
  estrutura de dados.
*/

function memoria(extra = {}) {
  return { nome: null, convenio: null, banco: null, coletado: {}, perguntado: {}, ...extra };
}

const confirmado = { confirmado: true, como: "cliente" };

test("cliente novo: pede o convênio primeiro, não tudo de uma vez", () => {
  const pedido = montarPedido(memoria());
  assert.ok(pedido);
  assert.match(pedido.texto, /INSS|servidor/i);
  assert.ok(pedido.chaves.length <= 2, "não pode virar formulário");
});

test("não pergunta o que já sabe", () => {
  const m = memoria({ convenio: "inss", banco: "Santander" });
  const falta = queFalta(m);

  assert.ok(!falta.includes("convenio"), "reperguntou o convênio");
  assert.ok(!falta.includes("banco"), "reperguntou o banco");
  assert.ok(falta.includes("contracheque"));
});

test("junta o que falta numa mensagem só", () => {
  const m = memoria({ convenio: "inss", banco: "Santander" });
  const pedido = montarPedido(m);

  assert.match(pedido.texto, / e /, "deveria juntar dois pedidos numa frase");
  assert.equal(pedido.chaves.length, 2);
});

test("com tudo coletado, não pede mais nada e libera a simulação", () => {
  const m = memoria({
    convenio: "inss",
    banco: "Santander",
    coletado: { contracheque: confirmado, margem: confirmado },
  });

  assert.equal(montarPedido(m), null);
  assert.equal(prontoPara(m), true);
});

test("fechar exige mais que simular", () => {
  const m = memoria({
    convenio: "inss",
    banco: "Santander",
    coletado: { contracheque: confirmado, margem: confirmado },
  });

  assert.equal(prontoPara(m, { para: "simular" }), true);
  assert.equal(prontoPara(m, { para: "fechar" }), false);
  assert.match(montarPedido(m, { para: "fechar" }).texto, /documento|endereço|agência/i);
});

test("desiste de pedir o que já pediu duas vezes", () => {
  const m = memoria({
    convenio: "inss",
    banco: "Santander",
    perguntado: {
      contracheque: { vezes: 2 },
      margem: { vezes: 2 },
    },
  });

  assert.equal(quantasVezesPerguntei(m, "contracheque"), 2);
  assert.equal(
    montarPedido(m),
    null,
    "insistir na terceira não traz o documento, traz bloqueio"
  );
});

test("pediu uma vez ainda pode pedir de novo", () => {
  const m = memoria({
    convenio: "inss",
    banco: "Santander",
    perguntado: { contracheque: { vezes: 1 } },
  });

  const pedido = montarPedido(m);
  assert.ok(pedido.chaves.includes("contracheque"));
});

test("memória vazia ou nula não quebra", () => {
  assert.ok(montarPedido(null));
  assert.ok(Array.isArray(queFalta(undefined)));
  assert.equal(prontoPara(null), false);
});
