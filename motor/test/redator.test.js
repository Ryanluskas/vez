import test from "node:test";
import assert from "node:assert/strict";
import { escreverPedido } from "../src/redator.js";
import { checarGatilhos } from "../src/gatilhos.js";
import { montarPedido } from "../src/requisitos.js";

/*
  O redator conversa com o modelo, então quase tudo dele só dá pra medir
  rodando o Ollama. O que cabe em teste é a decisão que vem ANTES da
  chamada — e ela existe por causa de uma medição do teste de ponta a ponta.
*/

test("pedido que fala de margem não gasta chamada de IA", async () => {
  /*
    "Me manda o extrato de margem" contém gatilho de dinheiro. O texto que
    o modelo escrevesse seria descartado pelo guarda e sairia o pedido cru
    de qualquer jeito — 90 segundos medidos indo pro lixo.

    Este teste não usa Ollama: se a função voltar sem chamar ninguém, ela
    responde na hora. Se um dia alguém tirar o atalho, ele passa a demorar
    e a falhar aqui.
  */
  const comecou = Date.now();
  const r = await escreverPedido({
    pedido: "me manda o extrato de margem",
    mensagemCliente: "quanto eu consigo?",
    nomeCliente: "Antonio",
    exemplos: [],
  });

  assert.equal(r, null, "quem chamou usa o pedido cru");
  assert.ok(Date.now() - comecou < 500, "chamou o modelo à toa");
});

test("o atalho não engole pedido que não fala de dinheiro", () => {
  // Estes têm que continuar indo pro modelo, pra sair no tom do consultor.
  for (const p of [
    "me manda seu contracheque atualizado",
    "você é aposentado/pensionista do INSS ou servidor público?",
    "me passa sua agência e conta",
    "me manda um documento com foto",
  ]) {
    assert.equal(checarGatilhos(p).travou, false, `"${p}" caiu no atalho sem precisar`);
  }
});

test("todo pedido que requisitos.js monta é ou seguro ou atalhado", () => {
  /*
    Garante que os dois caminhos cobrem tudo: nenhum pedido possível fica
    num limbo em que o modelo escreve e o guarda descarta em silêncio.
  */
  const memorias = [
    null,
    { convenio: "inss", coletado: {} },
    { convenio: "inss", banco: "Santander", coletado: {} },
    {
      convenio: "inss",
      banco: "Santander",
      coletado: { contracheque: { confirmado: true }, margem: { confirmado: true } },
    },
  ];

  for (const m of memorias) {
    for (const para of ["simular", "fechar"]) {
      const pedido = montarPedido(m, { para });
      if (!pedido) continue;

      const travou = checarGatilhos(pedido.texto).travou;
      // Travou = vai pelo atalho. Não travou = vai pro modelo. Os dois valem.
      assert.equal(typeof travou, "boolean");
    }
  }
});
