import test from "node:test";
import assert from "node:assert/strict";
import { criarTravas, criarMemoriaDeEventos } from "../src/travas.js";

/*
  Duas exigências que parecem opostas e são a mesma:

    o cliente ansioso manda três mensagens em três segundos e não pode
    receber três respostas;

    o cliente A esperando o consultor não pode fazer o cliente B esperar.

  Uma fila global resolveria a primeira e criaria a segunda. Por isso a
  trava é por conversa.
*/

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test("três mensagens do mesmo cliente viram três turnos, na ordem", async () => {
  const travas = criarTravas();
  const ordem = [];

  await Promise.all(
    [1, 2, 3].map((n) =>
      travas.naVezDe("cliente-A", async () => {
        ordem.push(`entrou ${n}`);
        await esperar(10);
        ordem.push(`saiu ${n}`);
      })
    )
  );

  // Nenhum "entrou" pode aparecer entre um "entrou" e o "saiu" dele.
  assert.deepEqual(ordem, [
    "entrou 1", "saiu 1",
    "entrou 2", "saiu 2",
    "entrou 3", "saiu 3",
  ]);
});

test("clientes diferentes correm em paralelo", async () => {
  const travas = criarTravas();
  const comecou = Date.now();

  await Promise.all(
    ["A", "B", "C", "D", "E"].map((quem) =>
      travas.naVezDe(quem, () => esperar(40))
    )
  );

  const levou = Date.now() - comecou;
  assert.ok(levou < 150, `cinco clientes levaram ${levou}ms — estão em fila única`);
});

test("um cliente travado não segura os outros", async () => {
  const travas = criarTravas();
  const terminou = [];

  /* O cliente A trava por 120ms. B, C e D têm que terminar antes dele. */
  const lento = travas.naVezDe("A", async () => {
    await esperar(120);
    terminou.push("A");
  });

  const rapidos = ["B", "C", "D"].map((q) =>
    travas.naVezDe(q, async () => {
      await esperar(10);
      terminou.push(q);
    })
  );

  await Promise.all([lento, ...rapidos]);

  assert.deepEqual(terminou.slice(0, 3).sort(), ["B", "C", "D"]);
  assert.equal(terminou[3], "A");
});

test("tarefa que estoura não trava a fila da conversa pra sempre", async () => {
  const travas = criarTravas();

  const quebrou = travas
    .naVezDe("A", async () => {
      throw new Error("classificação falhou");
    })
    .catch((e) => e.message);

  const depois = travas.naVezDe("A", async () => "consegui");

  assert.equal(await quebrou, "classificação falhou");
  assert.equal(await depois, "consegui", "a conversa ficou presa depois de um erro");
});

test("a fila esvazia sozinha: sem vazamento de memória", async () => {
  const travas = criarTravas();

  await Promise.all(
    Array.from({ length: 50 }, (_, i) => travas.naVezDe(`cliente-${i}`, () => esperar(1)))
  );

  assert.equal(travas.ocupadas(), 0, "sobrou entrada no mapa depois de tudo terminar");
});

test("sem id de conversa, a tarefa roda direto", async () => {
  const travas = criarTravas();
  assert.equal(await travas.naVezDe(null, async () => "ok"), "ok");
});

/* ------------------------------------------------- mensagens duplicadas */

test("o mesmo evento do WhatsApp só passa uma vez", () => {
  const jaVi = criarMemoriaDeEventos();

  assert.equal(jaVi.novo("false_5511@c.us_ABC"), true);
  assert.equal(jaVi.novo("false_5511@c.us_ABC"), false);
  assert.equal(jaVi.novo("false_5511@c.us_XYZ"), true);
});

test("evento sem id passa: não dá pra deduplicar o que não tem nome", () => {
  const jaVi = criarMemoriaDeEventos();
  assert.equal(jaVi.novo(null), true);
  assert.equal(jaVi.novo(undefined), true);
});

test("a janela é curta de propósito e não cresce sem limite", () => {
  const jaVi = criarMemoriaDeEventos(10);

  for (let i = 0; i < 100; i++) jaVi.novo(`msg-${i}`);

  assert.equal(jaVi.tamanho(), 10);
  // O mais antigo saiu da janela; o mais novo continua lá.
  assert.equal(jaVi.novo("msg-0"), true);
  assert.equal(jaVi.novo("msg-99"), false);
});

test("reentrega em rajada não gera processamento duplicado", async () => {
  const travas = criarTravas();
  const jaVi = criarMemoriaDeEventos();
  let processadas = 0;

  // O WhatsApp reentrega o mesmo evento cinco vezes ao reconectar.
  const eventos = Array.from({ length: 5 }, () => ({ id: "evento-1", conversa: "A" }));

  await Promise.all(
    eventos.map((e) => {
      if (!jaVi.novo(e.id)) return null;
      return travas.naVezDe(e.conversa, async () => {
        await esperar(5);
        processadas++;
      });
    })
  );

  assert.equal(processadas, 1, "o cliente receberia cinco respostas iguais");
});
