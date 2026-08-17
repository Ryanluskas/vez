import test from "node:test";
import assert from "node:assert/strict";
import { tentar, disjuntor, ehPassageiro } from "../src/resiliencia.js";
import { peneirar, criarObservador, observadorMudo, EVENTOS } from "../src/observar.js";

/*
  O motor roda o dia inteiro na máquina do consultor, sem ninguém olhando.
  Nesse regime tudo cai em algum momento — a questão nunca é "se", é o que
  acontece depois.

  A regra que atravessa todos estes testes: falha nunca vira resposta
  chutada. Vira pendência.
*/

/* ---------------------------------------------------------- o que retenta */

test("falha passageira: tenta de novo e consegue", async () => {
  let vezes = 0;

  const r = await tentar(
    async () => {
      vezes++;
      if (vezes < 3) throw new Error("ECONNRESET");
      return "voltou";
    },
    { nome: "teste", tentativas: 4, silencioso: true }
  );

  assert.equal(r.ok, true);
  assert.equal(r.valor, "voltou");
  assert.equal(vezes, 3);
});

test("erro de programação não é retentado", async () => {
  let vezes = 0;

  const r = await tentar(
    async () => {
      vezes++;
      throw new TypeError("x is not a function");
    },
    { nome: "teste", tentativas: 4, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.equal(vezes, 1, "repetir bug só gasta o tempo do cliente");
});

test("401 não é retentado; 503 é", () => {
  assert.equal(ehPassageiro(new Error("Request failed with 401 Unauthorized")), false);
  assert.equal(ehPassageiro(new Error("Request failed with 503")), true);
  assert.equal(ehPassageiro(new Error("fetch failed")), true);
  assert.equal(ehPassageiro(new Error("timeout de 8s")), true);
  assert.equal(ehPassageiro(new Error("404 not found")), false);
});

test("desistir devolve resposta, não exceção", async () => {
  const r = await tentar(
    async () => {
      throw new Error("ETIMEDOUT");
    },
    { nome: "teste", tentativas: 2, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.match(r.erro, /ETIMEDOUT/);
});

test("desistir avisa quem precisa saber", async () => {
  let avisado = null;

  await tentar(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    {
      nome: "Ollama",
      tentativas: 2,
      silencioso: true,
      aoFalhar: (erro) => {
        avisado = erro.message;
      },
    }
  );

  assert.match(avisado, /ECONNREFUSED/);
});

/* -------------------------------------------------------------- disjuntor */

test("depois de N falhas o disjuntor abre e para de tentar", async () => {
  const d = disjuntor("Serviço", { falhasParaAbrir: 3, descansoMs: 5000 });
  let chamadas = 0;

  const quebrado = async () => {
    chamadas++;
    throw new Error("ECONNREFUSED");
  };

  for (let i = 0; i < 3; i++) {
    await d.rodar(quebrado, { tentativas: 1, silencioso: true });
  }

  assert.equal(d.aberto, true);
  const antes = chamadas;

  const r = await d.rodar(quebrado, { tentativas: 1, silencioso: true });
  assert.equal(r.ok, false);
  assert.equal(r.aberto, true);
  assert.equal(chamadas, antes, "com o disjuntor aberto a chamada nem deve sair");
});

test("uma resposta boa zera o disjuntor", async () => {
  const d = disjuntor("Serviço", { falhasParaAbrir: 3, descansoMs: 5000 });

  await d.rodar(async () => { throw new Error("ETIMEDOUT"); }, { tentativas: 1, silencioso: true });
  await d.rodar(async () => { throw new Error("ETIMEDOUT"); }, { tentativas: 1, silencioso: true });
  assert.equal(d.estado, "instavel");

  const r = await d.rodar(async () => "voltou", { silencioso: true });
  assert.equal(r.ok, true);
  assert.equal(d.estado, "ok");
});

test("o disjuntor reabre a porta depois do descanso", async () => {
  const d = disjuntor("Serviço", { falhasParaAbrir: 1, descansoMs: 30 });

  await d.rodar(async () => { throw new Error("ECONNREFUSED"); }, { tentativas: 1, silencioso: true });
  assert.equal(d.aberto, true);

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(d.aberto, false, "ficou fechado pra sempre");

  const r = await d.rodar(async () => "ok", { silencioso: true });
  assert.equal(r.ok, true);
});

/* --------------------------------------- os cenários que o produto enfrenta */

test("Ollama offline: o agente não inventa, devolve nada", async () => {
  // É o contrato que o resto do motor espera: null vira pendência lá em cima.
  const d = disjuntor("Ollama", { falhasParaAbrir: 2, descansoMs: 1000 });

  const r = await d.rodar(
    async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    },
    { tentativas: 2, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.equal(r.valor, undefined, "não pode existir valor de consolo");
});

test("Groq fora do ar cai no local: quem chama recebe a falha e degrada", async () => {
  const groq = disjuntor("Groq", { falhasParaAbrir: 2, descansoMs: 1000 });
  const local = disjuntor("Ollama");

  const doGroq = await groq.rodar(
    async () => { throw new Error("429 rate limit"); },
    { tentativas: 1, silencioso: true }
  );
  assert.equal(doGroq.ok, false);

  const doLocal = await local.rodar(async () => "escrevi com o modelo local", { silencioso: true });
  assert.equal(doLocal.ok, true);
});

test("Supabase hibernando: retenta e volta", async () => {
  let vezes = 0;

  const r = await tentar(
    async () => {
      vezes++;
      if (vezes === 1) throw new Error("fetch failed");
      return { data: [] };
    },
    { nome: "Supabase", tentativas: 3, silencioso: true }
  );

  assert.equal(r.ok, true);
  assert.equal(vezes, 2);
});

test("WhatsApp recusando envio: duas tentativas e desiste sem marcar como enviado", async () => {
  let enviou = 0;

  const r = await tentar(
    async () => {
      enviou++;
      throw new Error("Evaluation failed: Execution context was destroyed");
    },
    { nome: "envio", tentativas: 2, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.equal(enviou, 2);
});

/* ------------------------------------------------------ o diário não vaza */

test("o diário esconde segredo", () => {
  const limpo = peneirar({
    id_conversa: "abc",
    token: "sb_secret_o8c1HpA",
    authorization: "Bearer eyJhbGciOi",
    chave_api: "gsk_abc123",
    termo: "prazo",
  });

  assert.equal(limpo.token, "[escondido]");
  assert.equal(limpo.authorization, "[escondido]");
  assert.equal(limpo.chave_api, "[escondido]");
  assert.equal(limpo.termo, "prazo", "o que é seguro tem que continuar legível");
});

test("o diário esconde segredo mesmo com nome de campo inocente", () => {
  const limpo = peneirar({ observacao: "usei sb_secret_o8c1HpA_hE8E pra conectar" });
  assert.equal(limpo.observacao, "[escondido]");
});

test("o diário corta texto longo em vez de guardar tudo", () => {
  const limpo = peneirar({ pergunta: "a".repeat(500) });
  assert.ok(limpo.pergunta.length < 250);
  assert.ok(limpo.pergunta.endsWith("…"));
});

test("o diário aguenta valor de qualquer tipo", () => {
  const limpo = peneirar({ n: 42, b: true, nulo: null, lista: [1, 2, 3], obj: { a: 1 } });
  assert.equal(limpo.n, 42);
  assert.equal(limpo.b, true);
  assert.equal(limpo.nulo, null);
  assert.equal(limpo.lista, "3 item(ns)");
  assert.equal(limpo.obj, "[objeto]");
  assert.deepEqual(peneirar(null), {});
});

test("gravar o diário não pode derrubar o atendimento", async () => {
  const bancoQuebrado = {
    from: () => ({
      insert: () => Promise.reject(new Error("tabela não existe")),
    }),
  };

  const observador = criarObservador({ supabase: bancoQuebrado, userId: "u1" });
  observador.registrar(EVENTOS.RECEBIDA, { idConversa: "c1", detalhe: "oi" });

  // Se o erro escapasse, isto estouraria como unhandledRejection.
  await observador.terminar();
  assert.ok(true);
});

test("observador mudo tem a mesma interface", async () => {
  const mudo = observadorMudo();
  mudo.registrar(EVENTOS.ERRO, { detalhe: "nada" });
  await mudo.terminar();
  assert.ok(true);
});
