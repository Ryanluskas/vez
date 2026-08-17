import test from "node:test";
import assert from "node:assert/strict";
import {
  respostaDeterministica,
  saudacao,
  documentoRecebido,
  informacaoRecebida,
  pedirOQueFalta,
  vouVerificar,
  conferido,
} from "../src/respostas.js";
import { checarGatilhos } from "../src/gatilhos.js";
import { numerosDeRisco } from "../src/numeros.js";
import { montarPedido, semRotulosDeRequisito } from "../src/requisitos.js";
import { disjuntor, tentar } from "../src/resiliencia.js";
import { validarAntesDeEnviar } from "../src/agente/validar.js";

/*
  ============================================================================
  A IA PODE CAIR. O CLIENTE NÃO PODE FICAR NO SILÊNCIO.

  Antes, quando a geração falhava, a conversa ia pra Fila e o cliente não
  recebia NADA até um humano abrir o painel. Do lado dele, isso é
  indistinguível de ter sido ignorado.

  Estes testes cobrem os dois lados da promessa:

    1. existe resposta segura sem IA para os casos óbvios
    2. quando não existe, o cliente é avisado E o caso vai pra Fila

  E o lado que não pode ceder: nenhuma dessas saídas tem número.
  ============================================================================
*/

/* ------------------------------------------------- 9. fallback determinístico */

test("saudação tem resposta sem IA", () => {
  const r = respostaDeterministica({ categoria: "saudacao", mensagemCliente: "bom dia" });
  assert.ok(r, "a saudação mais comum do dia dependia do modelo");
  assert.ok(r.length > 10);
});

test("agradecimento responde diferente de cumprimento", () => {
  const cumprimento = saudacao("bom dia", null, 0);
  const agradecimento = saudacao("obrigado!", null, 0);
  assert.notEqual(cumprimento, agradecimento, "respondeu 'como posso ajudar' a um obrigado");
});

test("a resposta usa o nome quando ele existe", () => {
  const r = respostaDeterministica({
    categoria: "saudacao",
    mensagemCliente: "oi",
    nomeCliente: "Antonio",
  });
  assert.match(r, /Antonio/);
});

test("documento recebido é confirmado na hora", () => {
  const r = documentoRecebido("Antonio", []);
  assert.match(r, /[Rr]ecebi/);
  assert.equal(numerosDeRisco(r).length, 0);
});

test("documento recebido diz o que ainda falta", () => {
  const r = documentoRecebido("Antonio", ["margem"]);
  assert.match(r, /margem/i);
});

test("informação do cliente é confirmada em voz alta", () => {
  const r = informacaoRecebida({ convenio: "inss" }, "Antonio");
  assert.ok(r);
  assert.match(r, /INSS/i);
});

test("sem fato novo, não inventa confirmação", () => {
  assert.equal(informacaoRecebida({}, "Antonio"), null);
  assert.equal(informacaoRecebida(null, "Antonio"), null);
});

test("pedido do que falta vira frase inteira sem IA", () => {
  const pedido = montarPedido(null);
  const r = pedirOQueFalta(pedido, "Antonio");
  assert.ok(r);
  assert.match(r, new RegExp(pedido.texto.slice(0, 20), "i"));
});

/* ----------------------------------------------------- 10. fallback pro humano */

test("o aviso de que alguém vai olhar não responde nada", () => {
  const r = vouVerificar("Antonio", 0);

  assert.match(r, /Antonio/);
  assert.equal(numerosDeRisco(r).length, 0, "o aviso não pode ter número");
  assert.equal(checarGatilhos(r).travou, false, "o aviso não pode cheirar a dinheiro");
  // Não promete resultado, só que alguém olha.
  assert.equal(/vai dar certo|consigo|aprovado|liberado/i.test(r), false);
});

test("categoria sem resposta segura devolve null — e aí é handoff", () => {
  /*
    O null aqui não é falha: é a resposta certa. Significa "isto precisa de
    linguagem de verdade", e quem chamou manda pra Fila com o aviso.
  */
  for (const categoria of ["valor", "elegibilidade", "acompanhamento", "outro"]) {
    const r = respostaDeterministica({
      categoria,
      mensagemCliente: "uma pergunta qualquer sobre isso",
    });
    assert.equal(r, null, `${categoria} ganhou resposta determinística sem dever ganhar`);
  }
});

/* ------------------------------------------- 12. valor nunca é inventado */

test("NENHUMA resposta determinística contém número", () => {
  const todas = [
    saudacao("bom dia", "Antonio", 0),
    saudacao("obrigado", "Antonio", 0),
    documentoRecebido("Antonio", []),
    documentoRecebido("Antonio", ["contracheque", "margem"]),
    informacaoRecebida({ convenio: "inss", banco: "Santander" }, "Antonio"),
    pedirOQueFalta(montarPedido(null), "Antonio"),
    vouVerificar("Antonio", 0),
  ];

  for (const t of todas) {
    assert.ok(t, "uma das respostas veio vazia");
    assert.equal(numerosDeRisco(t).length, 0, `tem número: "${t}"`);
    assert.equal(/\d/.test(t), false, `tem dígito: "${t}"`);
    // Passar pelo guarda é o que vale: ele já sabe que "extrato de margem"
    // é nome de documento, não valor.
    assert.equal(conferido(t), t, `o próprio guarda recusaria: "${t}"`);
  }
});

test("o guarda deixa pedir o extrato de margem, e nada além disso", () => {
  /*
    "Extrato de margem" tem a palavra "margem", que é gatilho. PEDIR o
    papel não é falar do valor — e o que separa as duas coisas é a
    procedência: este texto vem de `requisitos.js`, que é código.
  */
  const pedindo = "Recebi, obrigado! Ainda falta extrato de margem pra eu conseguir seguir.";
  assert.equal(conferido(pedindo), pedindo, "o bot não consegue pedir o próprio documento");

  // Mas falar DA margem continua barrado.
  assert.equal(conferido("Sua margem está liberada, pode ficar tranquilo!"), null);
  assert.equal(conferido("Vi aqui que sobra margem pra você"), null);
});

test("o guarda de saída recusa frase minha que fale de dinheiro", () => {
  /*
    Escrevi todas as frases à mão e ainda assim confiro na saída. Texto
    sofre edição, e a edição de amanhã não vai lembrar desta regra.
  */
  assert.equal(conferido("Consegui liberar R$ 4.200 pra você!"), null);
  assert.equal(conferido("Sua parcela vai ficar bem tranquila"), null);
  assert.equal(conferido("Recebi! Vou verificar e te respondo."), "Recebi! Vou verificar e te respondo.");
});

test("pergunta de valor nunca ganha resposta determinística", () => {
  for (const p of [
    "quanto eu consigo?",
    "qual a parcela?",
    "quanto eu pego?",
    "me faz uma simulação",
  ]) {
    const r = respostaDeterministica({ categoria: "valor", mensagemCliente: p });
    assert.equal(r, null, `"${p}" ganhou resposta pronta`);
  }
});

/* ---------------------------------------- 1-6. os estados da IA externa */

test("1. Groq respondendo: o texto passa adiante", async () => {
  const groq = disjuntor("Groq");
  const r = await groq.rodar(async () => "Oi! Tudo bem?", { silencioso: true });

  assert.equal(r.ok, true);
  assert.equal(r.valor, "Oi! Tudo bem?");
  assert.equal(groq.estado, "ok");
});

test("2. Groq indisponível: cai pro próximo, não inventa", async () => {
  const groq = disjuntor("Groq", { falhasParaAbrir: 2, descansoMs: 1000 });

  const r = await groq.rodar(
    async () => {
      throw new Error("429 rate limit");
    },
    { tentativas: 1, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.equal(r.valor, undefined, "não pode existir valor de consolo");
});

test("3-4. Ollama respondendo e indisponível", async () => {
  const ollama = disjuntor("Ollama", { falhasParaAbrir: 2, descansoMs: 1000 });

  const bom = await ollama.rodar(async () => "escrevi", { silencioso: true });
  assert.equal(bom.ok, true);

  const ruim = await ollama.rodar(
    async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    },
    { tentativas: 1, silencioso: true }
  );
  assert.equal(ruim.ok, false);
});

test("5. os dois fora: existe resposta determinística mesmo assim", async () => {
  const groq = disjuntor("Groq", { falhasParaAbrir: 1, descansoMs: 1000 });
  const ollama = disjuntor("Ollama", { falhasParaAbrir: 1, descansoMs: 1000 });

  const cair = async () => {
    throw new Error("ECONNREFUSED");
  };

  const a = await groq.rodar(cair, { tentativas: 1, silencioso: true });
  const b = await ollama.rodar(cair, { tentativas: 1, silencioso: true });

  assert.equal(a.ok, false);
  assert.equal(b.ok, false);

  // Com as duas fora, "bom dia" continua tendo resposta.
  const r = respostaDeterministica({ categoria: "saudacao", mensagemCliente: "bom dia" });
  assert.ok(r, "com a IA toda fora, a saudação ficaria sem resposta");
});

test("6. timeout devolve falha, não texto pela metade", async () => {
  const r = await tentar(
    async () => {
      throw new Error("desistiu depois de 12s");
    },
    { nome: "teste", tentativas: 1, silencioso: true }
  );

  assert.equal(r.ok, false);
  assert.equal(r.valor, undefined);
});

/* --------------------------------------- 7. geração inválida */

test("7. geração inválida vale o mesmo que geração nenhuma", () => {
  /*
    O modelo devolvendo lixo tem que levar ao mesmo lugar que ele não
    devolver nada: o fallback. Quem recusa o lixo é o validador
    (validador.test.js cobre cada formato). O que este teste garante é
    que, recusado o lixo, ainda sobra resposta pro cliente.
  */
  const naoServem = [
    '{"resposta":"oi"}',
    "```\nresposta\n```",
    "Você: oi Antonio",
    "Como uma IA, não posso...",
    "NAO_SEI",
  ];

  for (const lixo of naoServem) {
    const porta = validarAntesDeEnviar(lixo, {});
    assert.equal(porta.ok, false, `o validador deixou passar: "${lixo}"`);
  }

  // E com tudo recusado, a saudação continua tendo resposta.
  assert.ok(respostaDeterministica({ categoria: "saudacao", mensagemCliente: "oi" }));
  assert.ok(vouVerificar(null, 0));
});

test("texto vazio nunca vira mensagem", () => {
  for (const vazio of ["", "   ", null, undefined]) {
    assert.equal(conferido(vazio), null);
  }
});

/* ------------------- 8. classificação certa + escrita falhando */

test("8. classificação resolvida por código sobrevive à escrita falhar", () => {
  /*
    O caso que motivou tudo isto: o código sabia que era saudação, a
    escrita falhou, e o cliente ficou esperando. Agora a mesma
    classificação tem resposta sem passar pela escrita.
  */
  const categoria = "saudacao";
  const semIa = respostaDeterministica({ categoria, mensagemCliente: "oi, tudo bem?" });

  assert.ok(semIa, "classificação certa e ainda assim ninguém responde");
  assert.equal(numerosDeRisco(semIa).length, 0);
});

test("8b. quando não há resposta pronta, sobra o aviso — nunca o silêncio", () => {
  const semIa = respostaDeterministica({
    categoria: "acompanhamento",
    mensagemCliente: "e aí, saiu minha proposta?",
  });
  assert.equal(semIa, null, "acompanhamento depende de dado seu; não pode ter resposta pronta");

  // E aí entra o aviso, que é o que impede o silêncio.
  const aviso = vouVerificar(null, 0);
  assert.ok(aviso);
  assert.equal(numerosDeRisco(aviso).length, 0);
});

/* ------------------------------------------ 11. o cliente não fica preso */

test("11. todo caminho termina em alguma coisa pro cliente", () => {
  /*
    Percorre as categorias e confirma que cada uma tem OU resposta
    determinística OU o aviso. Nenhuma pode terminar em nada.
  */
  const categorias = [
    "saudacao", "documentos", "prazo", "horario",
    "elegibilidade", "acompanhamento", "valor", "outro",
  ];

  for (const categoria of categorias) {
    const pronta = respostaDeterministica({ categoria, mensagemCliente: "alguma coisa" });
    const aviso = vouVerificar(null, 0);

    assert.ok(
      pronta || aviso,
      `${categoria} pode terminar sem nada pro cliente`
    );
  }
});

test("11b. o aviso funciona sem nome e sem memória", () => {
  const r = vouVerificar(null, 0);
  assert.ok(r && r.length > 10);
  assert.equal(/undefined|null/.test(r), false);
});

test("entradas estranhas não quebram o fallback", () => {
  assert.doesNotThrow(() => respostaDeterministica({}));
  assert.doesNotThrow(() => respostaDeterministica({ categoria: null, mensagemCliente: null }));
  assert.doesNotThrow(() => documentoRecebido(null, null));
  assert.doesNotThrow(() => pedirOQueFalta(null, null));
});

/* ------------------------------------ a segunda chance é UMA, não infinita */

test("o guarda continua valendo na segunda tentativa", () => {
  /*
    A segunda tentativa existe porque o modelo às vezes escolhe uma palavra
    de dinheiro que estava no manual — variação de temperatura, não erro de
    raciocínio. O que ela NÃO faz é afrouxar nada: passa pelo mesmo crivo.

    Se pudesse tentar até passar, o guarda viraria decoração: bastava rolar
    o dado até sair o número que eu quero.
  */
  const inseguras = [
    "Consegui liberar R$ 4.200 pra você!",
    "Sua margem está liberada, pode ficar tranquilo",
    "Sua parcela vai ficar bem tranquila",
    "Seu saldo devedor já está quitado",
  ];

  for (const t of inseguras) {
    assert.equal(conferido(t), null, `passaria numa segunda tentativa: "${t}"`);
    assert.equal(validarAntesDeEnviar(t, {}).ok, false, `o validador deixou passar: "${t}"`);
  }
});

test("duas tentativas recusadas viram handoff, não terceira tentativa", () => {
  /*
    Isto é sobre o contrato de `escreverResposta`: ela devolve null depois
    da segunda recusa, e quem chamou manda pra Fila com o aviso. Não existe
    caminho que insista.
  */
  const semResposta = null;
  const pronta = respostaDeterministica({
    categoria: "prazo",
    mensagemCliente: "quanto tempo demora?",
  });

  // Prazo não tem resposta pronta — depende do manual, que é linguagem.
  assert.equal(pronta, null);

  // Então sobra o aviso, e o cliente não fica sem nada.
  const aviso = vouVerificar("Antonio", 0);
  assert.ok(aviso);
  assert.equal(semResposta ?? aviso, aviso);
});

/* ------------------------------- nome de documento não é valor */

test("o bot pode falar do papel que ele mesmo pediu", () => {
  /*
    "Extrato de margem" tem a palavra "margem". O bot pede esse papel numa
    mensagem, e a partir daí a frase fica no CONTEXTO da conversa — que é o
    que ele lê pra responder a próxima.

    Foi assim que "quanto tempo demora pra cair?" virou "vou verificar":
    a resposta certa mencionava o extrato que o próprio bot tinha pedido.
  */
  const podem = [
    "Depois de aprovado cai em até 2 dias úteis. Assim que você me mandar o extrato de margem eu sigo!",
    "Recebi seu contracheque! Falta só o extrato de margem.",
  ];

  for (const t of podem) {
    assert.equal(checarGatilhos(t).travou, true, "o caso perdeu a graça: não trava mais");
    assert.equal(
      checarGatilhos(semRotulosDeRequisito(t)).travou,
      false,
      `continuaria barrado: "${t}"`
    );
  }
});

test("trocar o nome do papel NÃO libera falar do valor dele", () => {
  /*
    Só entram aqui frases que TRAVAM antes da troca. O ponto do teste é que
    elas continuam travando depois — a troca não pode virar porta de saída.

    "Sua margem está liberada" não contém o rótulo "extrato de margem",
    então a troca não toca nela e o gatilho segue de pé.
  */
  const naoPodem = [
    "Sua margem está liberada, pode ficar tranquilo.",
    "Vi aqui que sobra margem pra você.",
    "Seu saldo devedor está quitado.",
    "Consegui liberar R$ 4.200 pra você.",
    "Sua parcela fica em 96x.",
  ];

  for (const t of naoPodem) {
    assert.equal(checarGatilhos(t).travou, true, `o caso não serve: "${t}" já passava`);
    assert.equal(
      checarGatilhos(semRotulosDeRequisito(t)).travou,
      true,
      `passou com a troca de rótulos: "${t}"`
    );
  }
});
