import test from "node:test";
import assert from "node:assert/strict";
import { canonico, numerosDeRisco, conferir, mascarar } from "../src/numeros.js";

/*
  Este arquivo nasceu de três falhas que os testes de handoff encontraram no
  próprio detector. Todas eram do mesmo tipo: o detector errando sozinho,
  sem IA nenhuma envolvida.

  Detector que acusa à toa é tão ruim quanto detector que deixa passar — na
  primeira semana o consultor cansa de ver rascunho recusado sem motivo e
  desliga a conferência.
*/

/* ------------------------------------------------------- mesmo número, formatos diferentes */

test("R$ 4.200,00 e 4200 são o mesmo número", () => {
  assert.equal(canonico("R$ 4.200,00"), canonico("4200"));
});

test("vírgula da frase não estraga o valor", () => {
  // "R$ 6.240,00, em 84x" — a vírgula depois do valor entrava no número
  // e o Number() dava NaN. O valor sumia dos permitidos e o texto do
  // próprio consultor era acusado de invenção.
  assert.deepEqual(conferir("R$ 6.240,00", "R$ 6.240,00, em 84x de 210"), []);
});

test("número não é contado duas vezes por padrões diferentes", () => {
  // \d{3,} pegava o "200" de dentro de "4.200,00".
  assert.deepEqual(numerosDeRisco("R$ 4.200,00"), ["4200"]);
});

/* ------------------------------------------------------------------------ taxa */

test("taxa é detectada mesmo sendo número pequeno", () => {
  assert.deepEqual(numerosDeRisco("taxa de 1,49% ao mês"), ["1.49%"]);
});

test("taxa que o consultor não deu é invenção", () => {
  assert.deepEqual(conferir("4200 em 12x, taxa de 1,49%", "4200 em 12x"), ["1.49%"]);
});

test("taxa não se confunde com valor de mesmo número", () => {
  // O consultor falou "1,49" de alguma outra coisa; não autoriza "1,49%".
  assert.deepEqual(conferir("a taxa é 1,49%", "1,49 reais de tarifa"), ["1.49%"]);
});

/* ------------------------------------------------------------------- mascarar */

test("máscara não parte a taxa ao meio", () => {
  // Antes virava "1,TAXA": o regex só pegava o "49%".
  assert.equal(mascarar("juros de 1,49% ao mês"), "juros de TAXA ao mês");
});

test("máscara tira todo dígito de dinheiro do exemplo", () => {
  const limpo = mascarar("liberei R$ 6.240,00 em 84x de R$ 210,00 com 1,79% a.m.");
  assert.equal(/\d/.test(limpo), false, limpo);
});

/* -------------------------------------------------------------- o que não é dinheiro */

test("prazo em dias não vira alarme falso", () => {
  assert.deepEqual(numerosDeRisco("cai em 2 dias úteis"), []);
});

test("texto sem número nenhum", () => {
  assert.deepEqual(numerosDeRisco("bom dia, tudo bem?"), []);
});

test("entrada vazia ou nula não quebra", () => {
  assert.deepEqual(numerosDeRisco(null), []);
  assert.deepEqual(numerosDeRisco(""), []);
  assert.equal(canonico("abc"), null);
});
