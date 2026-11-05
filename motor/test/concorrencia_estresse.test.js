import { test } from "node:test";
import assert from "node:assert/strict";
import { criarTravas } from "../src/travas.js";

test("Concorrência: serialização estrita por conversa com 30 clientes simultâneos", async () => {
  const travas = criarTravas();
  const NUM_CLIENTES = 30;
  const MSGS_POR_CLIENTE = 5;

  const historicoPorCliente = new Map();
  for (let i = 1; i <= NUM_CLIENTES; i++) {
    historicoPorCliente.set(`cliente_${i}`, []);
  }

  // Dispara 150 mensagens concorrentes de 30 clientes diferentes
  const promessas = [];
  for (let i = 1; i <= NUM_CLIENTES; i++) {
    const idConversa = `cliente_${i}`;
    for (let m = 1; m <= MSGS_POR_CLIENTE; m++) {
      const seq = m;
      promessas.push(
        travas.naVezDe(idConversa, async () => {
          // Simula latência de processamento assíncrono (5 a 20ms)
          await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15) + 5));
          historicoPorCliente.get(idConversa).push(seq);
          return seq;
        })
      );
    }
  }

  await Promise.all(promessas);

  // Valida que para CADA cliente, as 5 mensagens foram processadas em ordem EXATA [1, 2, 3, 4, 5]
  for (let i = 1; i <= NUM_CLIENTES; i++) {
    const idConversa = `cliente_${i}`;
    const ordem = historicoPorCliente.get(idConversa);
    assert.deepEqual(
      ordem,
      [1, 2, 3, 4, 5],
      `Cliente ${idConversa} deve ter suas mensagens processadas estritamente em ordem serializada`
    );
  }

  // Valida que o mapa de travas é liberado e não causa vazamento de memória
  assert.equal(travas.ocupadas(), 0, "O mapa de filas deve estar completamente limpo após o processamento");
});

test("Concorrência: falha em tarefa anterior NÃO gera unhandled rejection e não trava a fila", async () => {
  const travas = criarTravas();
  const idConversa = "conversa_com_erro";
  const execucoes = [];

  // Tarefa 1: estoura com erro intencional
  const p1 = travas.naVezDe(idConversa, async () => {
    await new Promise((r) => setTimeout(r, 10));
    execucoes.push("t1_falhou");
    throw new Error("Erro intencional de rede/banco na tarefa 1");
  });

  // Tarefa 2: deve rodar normalmente após a falha da 1
  const p2 = travas.naVezDe(idConversa, async () => {
    await new Promise((r) => setTimeout(r, 10));
    execucoes.push("t2_sucesso");
    return "ok_t2";
  });

  // Tarefa 3: deve rodar após a 2
  const p3 = travas.naVezDe(idConversa, async () => {
    execucoes.push("t3_sucesso");
    return "ok_t3";
  });

  await assert.rejects(() => p1, /Erro intencional/);
  const r2 = await p2;
  const r3 = await p3;

  assert.equal(r2, "ok_t2");
  assert.equal(r3, "ok_t3");
  assert.deepEqual(execucoes, ["t1_falhou", "t2_sucesso", "t3_sucesso"]);
  assert.equal(travas.ocupadas(), 0);
});
