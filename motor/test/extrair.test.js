import test from "node:test";
import assert from "node:assert/strict";
import {
  extrairPorRegra,
  convenioDe,
  bancoDe,
  nomeDe,
  objetivoDe,
  aindaFalta,
} from "../src/extrair.js";
import { classificarPorRegra } from "../src/classificar.js";
import { checarGatilhos } from "../src/gatilhos.js";

/*
  Este arquivo nasceu de uma medição: o llama3.2:3b acertou 2 de 9 extrações
  e levou dezenas de segundos em cada uma. A consequência em produção foi o
  bot perguntar ao cliente o convênio que ele tinha acabado de dizer.

  As nove frases da medição estão aqui. Se alguém trocar a regra por modelo
  de novo, elas caem.
*/

/* ------------------------------------------------------- as nove da medição */

test("as nove frases que o modelo errava", () => {
  const casos = [
    ["sou aposentado do INSS", "convenio", "inss"],
    ["sou aposentada pelo INSS", "convenio", "inss"],
    ["recebo pelo INSS", "convenio", "inss"],
    ["sou pensionista", "convenio", "inss"],
    ["sou servidor público estadual", "convenio", "servidor"],
    ["sou militar da reserva", "convenio", "militar"],
    ["meu nome é Antonio", "nome", "Antonio"],
    ["meu empréstimo hoje é no Santander", "banco", "Santander"],
    ["quero baixar minha taxa", "objetivo", "reducao_taxa"],
  ];

  for (const [frase, campo, esperado] of casos) {
    assert.equal(extrairPorRegra(frase)[campo], esperado, `"${frase}"`);
  }
});

/* ------------------------------------------------------------------ convênio */

test("convênio nas formas que o cliente escreve", () => {
  for (const frase of [
    "sou aposentado",
    "aposentada há 3 anos",
    "meu benefício do INSS",
    "sou pensionista do meu marido",
    "recebo pela previdência",
  ]) {
    assert.equal(convenioDe(frase), "inss", `"${frase}"`);
  }

  for (const frase of [
    "trabalho na prefeitura",
    "sou funcionário público municipal",
    "sou professora da rede estadual",
    "tenho siape",
  ]) {
    assert.equal(convenioDe(frase), "servidor", `"${frase}"`);
  }
});

test("militar ganha de servidor: a resposta mais específica é a certa", () => {
  // Militar TAMBÉM é servidor público. A ordem da lista resolve.
  assert.equal(convenioDe("sou policial militar do estado"), "militar");
  assert.equal(convenioDe("sou bombeiro"), "militar");
});

test("frase sem convênio não inventa convênio", () => {
  for (const frase of ["bom dia", "quanto tempo demora?", "já mandei os documentos"]) {
    assert.equal(convenioDe(frase), null, `"${frase}"`);
  }
});

/* --------------------------------------------------------------------- banco */

test("banco sai com o nome limpo, não do jeito que foi digitado", () => {
  assert.equal(bancoDe("meu contrato é no santander"), "Santander");
  assert.equal(bancoDe("tá no BMG"), "BMG");
  assert.equal(bancoDe("é do banco pan"), "Pan");
  assert.equal(bancoDe("no c6"), "C6");
});

test("banco fora da lista fica pro modelo", () => {
  assert.equal(bancoDe("é no banco XPTO regional"), null);
});

/* ---------------------------------------------------------------------- nome */

test("só apresentação explícita vira nome", () => {
  assert.equal(nomeDe("meu nome é Josenete"), "Josenete");
  assert.equal(nomeDe("me chamo Marlene"), "Marlene");
  assert.equal(nomeDe("aqui é o Abimael"), "Abimael");
});

test("não deduz nome de qualquer coisa", () => {
  for (const frase of ["bom dia, tudo bem?", "quanto libera?", "sou do INSS"]) {
    assert.equal(nomeDe(frase), null, `"${frase}"`);
  }
});

test('"sou o titular" não vira um cliente chamado Titular', () => {
  assert.equal(nomeDe("sou o titular mesmo"), null);
  assert.equal(nomeDe("sou a esposa dele"), null);
  assert.equal(nomeDe("sou o aposentado"), null);
});

/* ------------------------------------------------------------------ objetivo */

test("objetivo nas formas comuns", () => {
  assert.equal(objetivoDe("quero baixar os juros"), "reducao_taxa");
  assert.equal(objetivoDe("dá pra reduzir minha parcela?"), "reducao_taxa");
  assert.equal(objetivoDe("quero fazer a portabilidade"), "portabilidade");
  assert.equal(objetivoDe("queria refinanciar"), "refinanciamento");
  assert.equal(objetivoDe("quero pegar um empréstimo"), "emprestimo_novo");
});

/* ------------------------------------------------- quando ainda chamar a IA */

test("com tudo achado pela regra, o modelo não é chamado", () => {
  const achados = { nome: "Antonio", convenio: "inss", banco: "Santander", objetivo: "reducao_taxa" };
  assert.equal(aindaFalta(null, achados), false);
});

test("faltando algo, o modelo ainda vale a chamada", () => {
  assert.equal(aindaFalta({ nome: "Antonio" }, { convenio: "inss" }), true);
});

test("a memória conta junto com o que a regra achou", () => {
  const memoria = { nome: "Antonio", banco: "Santander", objetivo: "reducao_taxa" };
  assert.equal(aindaFalta(memoria, { convenio: "inss" }), false);
});

/* ------------------------------------------------------------- classificação */

test("saudação não gasta chamada de modelo", () => {
  for (const frase of ["bom dia", "oi", "olá!", "boa tarde, tudo bem?", "obrigado", "valeu"]) {
    const r = classificarPorRegra(frase);
    assert.ok(r, `"${frase}" foi pro modelo à toa`);
    assert.equal(r.categoria, "saudacao");
    assert.equal(r.precisaDoRyan, false);
    assert.equal(r.semModelo, true);
  }
});

test("horário e documentos também se resolvem sozinhos", () => {
  assert.equal(classificarPorRegra("vocês atendem no sábado?")?.categoria, "horario");
  assert.equal(classificarPorRegra("quais documentos eu preciso levar?")?.categoria, "documentos");
});

test("frase que não é óbvia vai pro modelo", () => {
  for (const frase of [
    "meu vizinho disse que consegue mais, é verdade?",
    "isso aí não é golpe não?",
    "já mandei tudo e não recebi retorno",
  ]) {
    assert.equal(classificarPorRegra(frase), null, `"${frase}" foi decidido por regra sem ser óbvio`);
  }
});

test("mensagem longa não é decidida por regra", () => {
  const longa = "bom dia " + "tudo bem ".repeat(20);
  assert.equal(classificarPorRegra(longa), null, "quanto mais texto, mais chance de ter outro assunto");
});

/* ---------------------------------------------------- a regra de ouro intacta */

test("NENHUM atalho da regra libera assunto de dinheiro", () => {
  /*
    O ponto que não pode cair. Os gatilhos rodam ANTES da regra de
    classificação; se alguma frase de dinheiro casasse com um padrão de
    "óbvio", ela seria liberada sem passar pelo consultor.
  */
  const perguntas = [
    "quanto eu consigo?",
    "qual a parcela?",
    "bom dia, quanto libera?",
    "oi, qual meu saldo?",
    "boa tarde, me faz uma simulação",
    "obrigado! e a taxa fica em quanto?",
    "quais documentos e quanto eu pego?",
  ];

  for (const p of perguntas) {
    const gatilho = checarGatilhos(p);
    const porRegra = classificarPorRegra(p);

    assert.ok(
      gatilho.travou || porRegra === null || porRegra.precisaDoRyan === true,
      `"${p}" foi liberado por regra sem passar pelo consultor`
    );
  }
});

test("a extração por regra nunca guarda número", () => {
  const r = extrairPorRegra("sou do INSS e preciso de 5000 reais, minha parcela é 380");
  assert.equal(r.convenio, "inss");
  for (const valor of Object.values(r)) {
    if (typeof valor === "string") {
      assert.equal(/\d{3,}/.test(valor), false, `guardou número: ${valor}`);
    }
  }
});

/* ------------------------------------------------------------------- bordas */

test("entrada vazia ou estranha não quebra", () => {
  for (const entrada of [null, undefined, "", "   ", "😀😀😀", "!!!!"]) {
    assert.doesNotThrow(() => extrairPorRegra(entrada));
    assert.doesNotThrow(() => classificarPorRegra(entrada));
  }
});

test("cumprimentos combinados não gastam modelo", () => {
  /*
    "oi, boa tarde" — dois cumprimentos — caiu no modelo na primeira versão
    e levou 21 segundos pra voltar como "outro, precisa do consultor". Uma
    saudação virando pendência é o pior caso: o cliente escreve "oi" e o
    consultor recebe uma tarefa.
  */
  for (const frase of [
    "oi, boa tarde",
    "olá, bom dia",
    "bom dia, tudo bem?",
    "oi tudo bem",
    "opa, e aí",
  ]) {
    const r = classificarPorRegra(frase);
    assert.ok(r, `"${frase}" foi pro modelo à toa`);
    assert.equal(r.categoria, "saudacao");
  }
});

test("saudação grudada em pergunta de dinheiro não é saudação", () => {
  for (const frase of ["oi, quanto libera?", "bom dia, qual a parcela?", "boa tarde, quanto eu pego?"]) {
    assert.equal(classificarPorRegra(frase), null, `"${frase}" foi liberado como saudação`);
  }
});
