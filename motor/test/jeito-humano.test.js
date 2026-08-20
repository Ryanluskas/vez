import test from "node:test";
import assert from "node:assert/strict";
import {
  saudacao,
  documentoRecebido,
  informacaoRecebida,
  pedirOQueFalta,
  vouVerificar,
  meAdiantei,
  conferido,
} from "../src/respostas.js";
import { oQueEstaReferenciando, resolver } from "../src/referencias.js";
import { montarPedido, queFalta, semRotulosDeRequisito } from "../src/requisitos.js";
import { primeiroNome, montarAbordagem } from "../src/abordagem.js";
import { checarGatilhos } from "../src/gatilhos.js";
import { numerosDeRisco } from "../src/numeros.js";
import { textoMalformado } from "../src/agente/validar.js";
import { ESTILO_BASE } from "../src/estilo.js";

/*
  ============================================================================
  O CLIENTE TEM QUE SENTIR QUE FALA COM O RYAN

  O bot já lembrava do contexto e ainda soava como chatbot. A diferença não
  estava no que ele sabia — estava no tamanho e no tom do que escrevia.

  Consultor no WhatsApp escreve uma linha. "Sim, consigo conferir isso pra
  você." Ponto. Não abre parágrafo pra confirmar recebimento, não anuncia o
  que vai fazer antes de fazer, não agradece a informação antes de usá-la.

  Estes testes medem o QUE DÁ PRA MEDIR sobre isso: tamanho, ausência das
  frases de robô, e as reações que precisam existir. O tom do que o modelo
  escreve não cabe em assert — mas o prompt que o pede está no redator, e o
  diálogo do Ademar mostra o resultado.
  ============================================================================
*/

const TODAS_AS_FRASES = [
  saudacao("bom dia", "Ademar", 0),
  saudacao("obrigado", "Ademar", 0),
  documentoRecebido("Ademar", []),
  documentoRecebido("Ademar", ["margem"]),
  informacaoRecebida({ convenio: "inss", banco: "Santander" }, "Ademar"),
  pedirOQueFalta(montarPedido({ origem: "entrada", coletado: {}, perguntado: {} }), "Ademar"),
  vouVerificar("Ademar", 0),
  meAdiantei("Ademar", 0),
];

/* ================================================================
   Tamanho: uma ou duas frases
   ================================================================ */

test("nenhuma frase do bot passa de duas sentenças", () => {
  for (const t of TODAS_AS_FRASES) {
    assert.ok(t, "veio vazia");

    const sentencas = t.split(/[.!?]+/).filter((s) => s.trim().length > 2);
    assert.ok(
      sentencas.length <= 2,
      `${sentencas.length} sentenças — parágrafo não é WhatsApp: "${t}"`
    );
  }
});

test("nenhuma frase do bot passa de 120 caracteres", () => {
  for (const t of TODAS_AS_FRASES) {
    assert.ok(t.length <= 120, `${t.length} caracteres: "${t}"`);
  }
});

/* ================================================================
   As frases que denunciam o robô
   ================================================================ */

const CARA_DE_ROBO = [
  /para que eu possa auxili/i,
  /estou [àa] disposi[çc][ãa]o/i,
  /informa[çc][õo]es adicionais/i,
  /agrade[çc]o por (?:compartilhar|informar)/i,
  /quaisquer esclarecimentos/i,
  /da melhor maneira poss[íi]vel/i,
  /prezad[oa]/i,
  /atenciosamente/i,
  /entendo sua solicita/i,
  /como (?:uma? )?(?:IA|modelo)/i,
];

test("nenhuma frase do bot tem cara de robô", () => {
  for (const t of TODAS_AS_FRASES) {
    for (const padrao of CARA_DE_ROBO) {
      assert.equal(padrao.test(t), false, `"${t}" casou com ${padrao}`);
    }
  }
});

test("nenhuma frase do bot repete a abordagem", () => {
  /*
    A abordagem estabelece o contexto uma vez. Repetir "vi que seu contrato
    Santander…" a cada resposta é o que faz o cliente perceber que está
    falando com máquina.
  */
  for (const t of TODAS_AS_FRASES) {
    assert.equal(/vi que seu contrato/i.test(t), false, `repetiu a abordagem: "${t}"`);
    assert.equal(/aqui [ée] o Ryan/i.test(t), false, `se apresentou de novo: "${t}"`);
  }
});

/* ================================================================
   "Mas você nem pediu isso" — correção, não pergunta
   ================================================================ */

test('"você nem pediu isso" é lido como correção', () => {
  for (const f of [
    "Mas por quê? Você nem pediu isso",
    "você nem pediu isso",
    "mas você não pediu",
    "você nem perguntou",
  ]) {
    assert.equal(oQueEstaReferenciando(f), "contesta_pedido", `"${f}"`);
  }
});

test("a resposta à correção recua, não repete o pedido", () => {
  const t = meAdiantei("Ademar", 0);

  assert.match(t, /raz[ãa]o|verdade|justo/i, "não reconheceu o erro");
  // O que ela NÃO pode fazer: pedir de novo.
  assert.equal(/me manda|preciso que|envie/i.test(t), false, `pediu de novo: "${t}"`);
  assert.equal(numerosDeRisco(t).length, 0);
});

/* ================================================================
   Origem do dado: "consegui", nunca "calculei"
   ================================================================ */

test("o bot não pode dizer que fez a simulação", () => {
  /*
    Quem faz a simulação é o sistema do banco. O bot dizendo "fiz a
    simulação e deu 4200" transforma um dado que VOCÊ conferiu num dado que
    ele calculou — e aí a próxima pergunta do cliente é dirigida a alguém
    que não sabe responder.

    A instrução está no prompt do redator. Aqui garanto que nenhuma frase
    determinística faz isso.
  */
  for (const t of TODAS_AS_FRASES) {
    assert.equal(
      /\b(?:fiz|rodei|calculei|simulei)\s+(?:a\s+|o\s+)?(?:simula|c[áa]lculo|conta)/i.test(t),
      false,
      `reivindicou o cálculo: "${t}"`
    );
  }
});

/* ================================================================
   Perguntas mínimas: uma coisa por mensagem
   ================================================================ */

test("o pedido não vira formulário", () => {
  const doZero = { origem: "entrada", etapa_comercial: "interesse", coletado: {}, perguntado: {} };
  const pedido = montarPedido(doZero);

  assert.equal(pedido.chaves.length, 1, `${pedido.chaves.length} itens de uma vez`);

  const frase = pedirOQueFalta(pedido, "Ademar");
  const interrogacoes = (frase.match(/\?/g) ?? []).length;
  assert.ok(interrogacoes <= 1, `${interrogacoes} perguntas numa mensagem: "${frase}"`);

  // Pontuação dobrada — "público?. Pode ser?" — já saiu daqui uma vez.
  assert.equal(/[.?!][.?!]/.test(frase), false, `pontuação dobrada: "${frase}"`);
  assert.equal(/pra eu conseguir te responder/i.test(frase), false, "voltou o embrulho");
});

test("em prospecção não pede nada antes da simulação", () => {
  /*
    O consultor procurou aquela pessoa porque já viu o contrato dela. Pedir
    documento na primeira resposta é o que faz o cliente concluir que
    ninguém olhou nada.
  */
  const prospec = {
    origem: "prospeccao",
    etapa_comercial: "prospeccao",
    nome: "Ademar",
    banco: "Santander",
    coletado: {},
    perguntado: {},
  };

  assert.deepEqual(queFalta(prospec), []);
  assert.equal(montarPedido(prospec), null);
});

/* ================================================================
   Handoff curto
   ================================================================ */

test("o aviso de handoff é uma frase, não um comunicado", () => {
  const t = vouVerificar("Ademar", 0);

  assert.ok(t.length <= 80, `${t.length} caracteres: "${t}"`);
  assert.match(t, /confirmar|conferir|olhada/i);

  // Não promete resultado, e não pede desculpa por existir.
  assert.equal(/desculp|infelizmente|lamento/i.test(t), false);
  assert.equal(numerosDeRisco(t).length, 0);
});

/* ================================================================
   O que não pode ceder
   ================================================================ */

test("toda frase nova continua passando pelo guarda", () => {
  for (const t of TODAS_AS_FRASES) {
    assert.equal(conferido(t), t, `o próprio guarda recusaria: "${t}"`);
    assert.equal(textoMalformado(t), null, `malformada: "${t}"`);
  }
});

test("nenhuma frase nova tem dígito nem cheira a dinheiro", () => {
  for (const t of TODAS_AS_FRASES) {
    assert.equal(/\d/.test(t), false, `tem dígito: "${t}"`);

    /*
      A comparação certa é a que o produto faz: tirar os rótulos de
      requisito ANTES de cheirar. "Extrato de margem" é o nome de um papel
      que o próprio código deu — pedir o papel não é falar da margem. Se
      sobrar algum gatilho depois da troca, aí é dinheiro de verdade.

      Media isso no texto cru na primeira versão e o teste acusou o pedido
      legítimo de documento.
    */
    assert.equal(
      checarGatilhos(semRotulosDeRequisito(t)).travou,
      false,
      `cheira a dinheiro mesmo sem os rótulos: "${t}"`
    );
  }
});

test("referência a valor sem valor no estado continua não inventando", () => {
  const semNada = { origem: "prospeccao", etapa_comercial: "prospeccao", simulacao: {}, coletado: {} };
  const r = resolver("aquele valor", semNada);

  assert.equal(r.tenho, false);
  assert.equal(r.simulacao, undefined);
});

test("o cliente é chamado pelo primeiro nome, não pelo nome do contato", () => {
  /*
    O nome vem da agenda do WhatsApp e vem inteiro. "Ademar Elleres, recebi
    seus documentos" é como um sistema escreve, não como alguém que conhece
    a pessoa — e essa é a primeira linha que o cliente lê na prospecção.
  */
  assert.equal(primeiroNome("Ademar Elleres"), "Ademar");
  assert.equal(primeiroNome("Maria da Silva Santos"), "Maria");
  assert.equal(primeiroNome("Ana"), "Ana");
  assert.equal(primeiroNome(null), null);
  assert.equal(primeiroNome("   "), null);

  const abertura = montarAbordagem({ nome: "Ademar Elleres" });
  assert.equal(/Elleres/.test(abertura), false, `nome completo na abertura: "${abertura}"`);
  assert.match(abertura, /Oi Ademar,/);

  for (const f of [
    documentoRecebido("Ademar Elleres", []),
    saudacao("bom dia", "Ademar Elleres", 0),
    meAdiantei("Ademar Elleres", 0),
    vouVerificar("Ademar Elleres", 0),
  ]) {
    assert.equal(/Elleres/.test(f), false, `nome completo: "${f}"`);
    assert.match(f, /Ademar/);
  }
});

test("entradas estranhas não quebram as frases novas", () => {
  for (const entrada of [null, undefined, ""]) {
    assert.doesNotThrow(() => meAdiantei(entrada, 0));
    assert.doesNotThrow(() => vouVerificar(entrada, 0));
    assert.doesNotThrow(() => saudacao(entrada, entrada, 0));
  }
});

/* ================================================================
   Os exemplos de estilo SÃO a voz do bot
   ================================================================ */

/*
  Descoberto numa conversa real. O prompt do redator manda escrever curto e
  sem formulário; os exemplos de fábrica faziam o contrário, e o cliente
  recebeu isto:

    "Preciso de: documento com foto, comprovante de endereço, contracheque
     atualizado e agência/conta."

  Que é o exemplo de `documentos` — quatro itens em quatro linhas —
  achatado numa linha. Veio duas vezes, e o cliente respondeu "mas você só
  fala isso?".

  Few-shot ganha de instrução. O modelo lê a regra e lê o exemplo; o
  exemplo é concreto, a regra é abstrata, e ele copia o exemplo. Então o
  exemplo tem que passar na mesma régua que a frase do bot.
*/
const TODOS_OS_EXEMPLOS = Object.entries(ESTILO_BASE).flatMap(([categoria, exs]) =>
  exs.map((e) => ({ categoria, texto: e.resposta_ryan }))
);

test("nenhum exemplo de estilo passa de duas frases", () => {
  for (const { categoria, texto } of TODOS_OS_EXEMPLOS) {
    const frases = texto.split(/[.!?\n]+/).filter((s) => s.trim().length > 2);
    assert.ok(
      frases.length <= 2,
      `[${categoria}] ${frases.length} frases — o modelo vai copiar: "${texto}"`
    );
    assert.ok(texto.length <= 110, `[${categoria}] ${texto.length} caracteres: "${texto}"`);
  }
});

test("nenhum exemplo de estilo é formulário", () => {
  for (const { categoria, texto } of TODOS_OS_EXEMPLOS) {
    assert.equal(/\n/.test(texto), false, `[${categoria}] lista em várias linhas: "${texto}"`);
    assert.equal(
      /:\s*\S+,\s*\S+/.test(texto),
      false,
      `[${categoria}] dois-pontos abrindo enumeração: "${texto}"`
    );
    // No máximo uma pergunta: interrogatório afasta.
    const perguntas = (texto.match(/\?/g) ?? []).length;
    assert.ok(perguntas <= 1, `[${categoria}] ${perguntas} perguntas: "${texto}"`);
  }
});

test("nenhum exemplo de estilo tem cara de robô", () => {
  for (const { categoria, texto } of TODOS_OS_EXEMPLOS) {
    for (const padrao of CARA_DE_ROBO) {
      assert.equal(padrao.test(texto), false, `[${categoria}] "${texto}" casou com ${padrao}`);
    }
    assert.equal(
      /(?:estou|fico|ficamos)\s+[àa]\s+disposi[çc][ãa]o/i.test(texto),
      false,
      `[${categoria}] "fico à disposição" é a mesma frase de robô: "${texto}"`
    );
  }
});

test("nenhum exemplo de estilo fura a regra de ouro", () => {
  /*
    Um exemplo que diz "vou rodar uma simulação" ensina o bot a dizer que
    ELE fez a conta. Quem faz é o sistema do banco — e o cliente que
    acredita no contrário dirige a próxima pergunta a quem não sabe
    responder.
  */
  for (const { categoria, texto } of TODOS_OS_EXEMPLOS) {
    assert.equal(
      /\b(?:rodar|rodei|fazer|fiz|refazer|calcular|calculei|simulei)\s+(?:uma?\s+|o\s+|a\s+)?(?:simula|c[áa]lculo|conta)/i.test(
        texto
      ),
      false,
      `[${categoria}] reivindicou a simulação: "${texto}"`
    );
  }
});

test("nenhum exemplo de estilo tem nome de pessoa fixo", () => {
  /*
    Tinha um "Tranquilo, Josenete" aqui. O modelo copia o exemplo inteiro,
    e "Josenete" ia parar numa mensagem pra outra pessoa.
  */
  for (const { categoria, texto } of TODOS_OS_EXEMPLOS) {
    /*
      Exige a VÍRGULA do vocativo. A primeira versão aceitava "!" também e
      acusou "Oi! Tudo ótimo" de ter uma pessoa chamada Tudo — o mesmo
      falso positivo que o validador já teve com "Tudo bem?".
    */
    const vocativo = texto.match(/,\s+([A-ZÀ-Ý][a-zà-ÿ]{3,})/);
    assert.equal(vocativo, null, `[${categoria}] nome fixo "${vocativo?.[1]}": "${texto}"`);
  }
});

test("o exemplo de documentos pede UMA coisa, igual ao código", () => {
  /*
    Não adianta `MAXIMO_POR_MENSAGEM = 1` em requisitos.js se o exemplo
    pede quatro documentos: o modelo copia o exemplo.
  */
  const pedido = ESTILO_BASE.documentos[0].resposta_ryan;
  const rotulos = ["documento", "comprovante", "contracheque", "agência", "conta", "margem"];
  const quantos = rotulos.filter((r) => new RegExp(r, "i").test(pedido)).length;

  assert.ok(quantos <= 1, `o exemplo pede ${quantos} documentos: "${pedido}"`);
});
