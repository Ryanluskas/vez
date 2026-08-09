import test from "node:test";
import assert from "node:assert/strict";
import { checarGatilhos } from "../src/gatilhos.js";

/*
  Este teste protege a regra de ouro: a IA nunca responde sobre dinheiro.

  A lista de baixo e escrita do jeito que cliente de consignado escreve de
  verdade — sem acento, sem pontuacao, com abreviacao e erro de digitacao.
  Se algum destes deixar de travar, o bot volta a poder chutar um numero.
*/

const TEM_QUE_TRAVAR = [
  "quanto eu consigo pegar no meu beneficio?",
  "quanto libera pra mim",
  "qto libera",
  "quanto vem pra mim",
  "quanto cai na minha conta",
  "quanto que sai",
  "da pra pegar quanto",
  "qual o valor que eu consigo",
  "e a parcela fica em quanto por mes?",
  "quantas parcelas fica",
  "a prestacao e alta?",
  "tem como simular pra mim",
  "faz uma simulacao ai",
  "qual meu saldo devedor",
  "quanto tenho de margem",
  "minha margem consignavel deu quanto",
  "qual o limite do cartao",
  "quanto de juros voce cobra",
  "qual a taxa",
  "da pra refinanciar? quanto de troco",
  "quero fazer portabilidade",
  "em quantas vezes posso parcelar",
  "consigo R$ 5000?",
  "preciso de 3 mil",
  "eu queria uns 12000",
  "1.500,00 da certo?",
  "QUANTO LIBERA",
  "Quanto Libéra Pra Mim?",
];

/*
  Estas o bot PODE responder sozinho. Se alguma comecar a travar, a fila
  enche de bobagem e o produto perde a graca — mas ninguem se machuca.
  Por isso este bloco e menos grave que o de cima.
*/
const NAO_PODE_TRAVAR = [
  "bom dia",
  "oi tudo bem?",
  "voce atende no sabado?",
  "quais documentos eu preciso levar",
  "onde fica seu escritorio",
  "obrigado!",
  "vc trabalha com INSS?",
  "qual seu nome mesmo",
  "quanto tempo demora pra cair na conta",
  "ja mandei meus documentos",
  "pode me ligar mais tarde",
];

test("trava tudo que cheira a dinheiro", () => {
  for (const frase of TEM_QUE_TRAVAR) {
    const { travou, motivo } = checarGatilhos(frase);
    assert.equal(travou, true, `DEIXOU PASSAR: "${frase}"`);
    assert.ok(motivo, `travou sem motivo legivel: "${frase}"`);
  }
});

test("deixa o bot atender o que nao é valor", () => {
  for (const frase of NAO_PODE_TRAVAR) {
    const { travou, motivo } = checarGatilhos(frase);
    assert.equal(travou, false, `travou à toa: "${frase}" (${motivo})`);
  }
});

test("aguenta entrada vazia ou nula sem quebrar", () => {
  assert.equal(checarGatilhos("").travou, false);
  assert.equal(checarGatilhos(null).travou, false);
  assert.equal(checarGatilhos(undefined).travou, false);
});
