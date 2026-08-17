import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_DA_LISTA,
  comoNumero,
  comoDinheiro,
  normalizarTelefone,
  montarValores,
  emTexto,
} from "../src/lista.js";
import { conferir } from "../src/numeros.js";

/*
  A lista é a primeira fonte de valor que existe dentro do produto. Antes
  dela, todo número vinha do consultor digitando na Fila.

  Por isso estes testes são sobre uma coisa só: o que sai daqui é exatamente
  o que o consultor autorizou, no valor que ele autorizou. Nem um campo a
  mais, nem um centavo a mais.
*/

/* Uma linha real da planilha do usuário, com os nomes de coluna dela. */
const LINHA = {
  Nome: "ABIMAEL LOUREIRO DA SILVA",
  CPF: 97740365220,
  DDD: 96,
  Celular: 999630133,
  Margem_Livre: "R$ 1.150,94",
  Soma_Parcelas: 846.44,
  Total_Parcelas: 600,
  Saldo_Devedor_Total: 37132.13,
  Reducao_Total: 3174.54,
  Contrato_1: "6******03",
  Parcelas_1: 120,
  Parcelas_Pagas_1: 35,
  Taxa_1: "1,95% a.m",
  Valor_Parcela_1: "R$ 846,44",
};

/* ------------------------------------------------------- ler os números */

test("lê número que veio como número e como texto", () => {
  assert.equal(comoNumero(3174.54), 3174.54);
  assert.equal(comoNumero("R$ 1.150,94"), 1150.94);
  assert.equal(comoNumero("R$ 0,00"), 0);
  assert.equal(comoNumero(""), null);
  assert.equal(comoNumero(null), null);
});

test("milhar da planilha não vira número dez vezes maior", () => {
  // "R$ 1.150,94" lido errado daria 115094 — e o cliente ouviria isso.
  assert.equal(comoNumero("R$ 1.150,94"), 1150.94);
  assert.equal(comoNumero("R$ 37.132,13"), 37132.13);
});

test("dinheiro sai no formato que se escreve no WhatsApp", () => {
  assert.equal(comoDinheiro(2095.1964), "R$ 2.095,20");
  assert.equal(comoDinheiro(66), "R$ 66,00");
});

/* ------------------------------------------------------------ telefone */

test("DDD e celular viram o telefone que o WhatsApp entrega", () => {
  const { telefone, curto } = normalizarTelefone(96, 999630133);
  assert.equal(telefone, "5596999630133");
  assert.equal(curto, "99630133", "é por aqui que se acha quem tem o nono dígito diferente");
});

test("telefone já com 55 não ganha outro 55", () => {
  assert.equal(normalizarTelefone("55", "96999630133").telefone, "5596999630133");
});

test("celular vazio não vira telefone", () => {
  assert.deepEqual(normalizarTelefone(96, ""), { telefone: null, curto: null });
});

/* ------------------------------------------ o que o consultor liberou */

test("campo não liberado não sai — nem existe na resposta", () => {
  const { valores } = montarValores(LINHA, { campos: ["reducao_total"], porcentagem: 100 });

  assert.equal(valores.reducao_total, "R$ 3.174,54");
  assert.equal(valores.margem_livre, undefined);
  assert.equal(valores.saldo_devedor, undefined);
  assert.equal(
    Object.keys(valores).length,
    1,
    "o redator não pode nem ver o campo que você desligou"
  );
});

test("nenhum campo liberado: não sai nada", () => {
  const { valores } = montarValores(LINHA, { campos: [], porcentagem: 100 });
  assert.deepEqual(valores, {});
});

test("todos os campos liberados saem juntos", () => {
  const { valores } = montarValores(LINHA, {
    campos: Object.keys(CAMPOS_DA_LISTA),
    porcentagem: 100,
  });

  assert.equal(valores.reducao_total, "R$ 3.174,54");
  assert.equal(valores.margem_livre, "R$ 1.150,94");
  assert.equal(valores.saldo_devedor, "R$ 37.132,13");
  assert.equal(valores.soma_parcelas, "R$ 846,44");
  assert.equal(valores.total_parcelas, "600");
  assert.equal(valores.contratos.length, 1);
  assert.equal(valores.contratos[0].taxa, "1,95% a.m");
});

/* --------------------------------------------------------- porcentagem */

test("66% da redução: o cliente ouve 66, não 100", () => {
  const { valores } = montarValores({ Reducao_Total: 100 }, {
    campos: ["reducao_total"],
    porcentagem: 66,
  });

  assert.equal(valores.reducao_total, "R$ 66,00");
});

test("a porcentagem vale na linha real da planilha", () => {
  const { valores } = montarValores(LINHA, { campos: ["reducao_total"], porcentagem: 66 });
  // 3174.54 × 0,66 = 2095,1964
  assert.equal(valores.reducao_total, "R$ 2.095,20");
});

test("a porcentagem NÃO toca os outros campos", () => {
  const { valores } = montarValores(LINHA, {
    campos: ["reducao_total", "saldo_devedor", "margem_livre"],
    porcentagem: 66,
  });

  assert.equal(valores.reducao_total, "R$ 2.095,20", "este é reduzido");
  assert.equal(valores.saldo_devedor, "R$ 37.132,13", "este é o da planilha");
  assert.equal(valores.margem_livre, "R$ 1.150,94", "este é o da planilha");
});

test("100% é o valor cheio da planilha", () => {
  const { valores } = montarValores(LINHA, { campos: ["reducao_total"], porcentagem: 100 });
  assert.equal(valores.reducao_total, "R$ 3.174,54");
});

/* ------------------------------------------------ a barreira do validador */

test("o valor cheio NÃO passa quando a porcentagem está ligada", () => {
  /*
    O ponto mais importante do arquivo. Com 66% configurado, o modelo só vê
    2.095,20. Se ele escrever 3.174,54 — o valor cheio — esse número não
    está em fonte nenhuma, e a conferência de procedência recusa.
  */
  const { texto } = montarComTexto(LINHA, 66);

  const inventou = conferir("Consegui liberar R$ 3.174,54 pra você!", texto);
  assert.ok(inventou.length > 0, "o valor cheio passou como se fosse autorizado");

  const certo = conferir("Consegui liberar R$ 2.095,20 pra você!", texto);
  assert.deepEqual(certo, [], "o valor reduzido é o autorizado e tem que passar");
});

test("campo desligado não vira fonte autorizada", () => {
  // Margem desligada: se o modelo citar a margem, não bate com nada.
  const { texto } = montarComTexto(LINHA, 100, ["reducao_total"]);

  const inventou = conferir("Sua margem livre é de R$ 1.150,94.", texto);
  assert.ok(inventou.length > 0, "falou de um campo que você desligou");
});

function montarComTexto(linha, porcentagem, campos = ["reducao_total", "saldo_devedor"]) {
  const { valores } = montarValores(linha, { campos, porcentagem });
  return { valores, texto: emTexto(valores) };
}

/* ------------------------------------------------------------- o texto */

test("o texto vira o bilhete que o consultor escreveria", () => {
  const { valores } = montarValores(LINHA, {
    campos: ["reducao_total", "soma_parcelas"],
    porcentagem: 66,
  });

  const t = emTexto(valores);
  assert.match(t, /economia total: R\$ 2\.095,20/);
  assert.match(t, /paga hoje por mês: R\$ 846,44/);
});

test("planilha sem as colunas esperadas não inventa campo", () => {
  const { valores } = montarValores(
    { Nome: "Fulano", ColunaEstranha: 999 },
    { campos: Object.keys(CAMPOS_DA_LISTA), porcentagem: 100 }
  );

  assert.deepEqual(valores, {}, "coluna que não existe tem que dar campo vazio, não erro");
});

test("linha vazia não quebra", () => {
  assert.deepEqual(montarValores({}, { campos: ["reducao_total"] }).valores, {});
  assert.deepEqual(montarValores(null, { campos: [] }).valores, {});
});
