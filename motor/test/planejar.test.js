import test from "node:test";
import assert from "node:assert/strict";
import { filtrarPlano, consultasEmTexto } from "../src/agente/planejar.js";

/*
  O modelo escolhe a ferramenta, mas o que ele devolve é texto — e texto de
  um modelo de 3B vem torto com frequência: nome que não existe, campo a
  mais, e às vezes uma escrita onde só cabia leitura.

  Estes testes são sobre a peneira, não sobre o modelo. Eles descrevem o
  pior que ele pode mandar e o que sobra depois.
*/

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("plano normal passa com o id preenchido pelo código", () => {
  const r = filtrarPlano(
    { consultas: [{ nome: "consultar_pendencias", argumentos: {} }] },
    ID
  );

  assert.equal(r.length, 1);
  assert.equal(r[0].argumentos.id_conversa, ID);
});

test("ferramenta inventada é descartada", () => {
  const r = filtrarPlano(
    {
      consultas: [
        { nome: "consultar_saldo_no_banco", argumentos: {} },
        { nome: "buscar_conhecimento", argumentos: { termo: "prazo" } },
      ],
    },
    ID
  );

  assert.equal(r.length, 1);
  assert.equal(r[0].nome, "buscar_conhecimento");
});

test("o modelo não consegue escrever, só ler", () => {
  const r = filtrarPlano(
    {
      consultas: [
        { nome: "atualizar_etapa", argumentos: { etapa: "fechado" } },
        { nome: "solicitar_intervencao", argumentos: { pergunta: "oi", motivo: "oi" } },
        { nome: "cancelar_followup", argumentos: {} },
      ],
    },
    ID
  );

  assert.deepEqual(r, [], "escrever é decidir, e decidir não é do modelo");
});

test("o id vem do código mesmo quando o modelo manda outro", () => {
  // Uma alucinação de id leria os dados de outro cliente. O código
  // sobrescreve depois do spread, e é por isso que a ordem importa.
  const r = filtrarPlano(
    {
      consultas: [
        {
          nome: "consultar_memoria",
          argumentos: { id_conversa: "99999999-9999-9999-9999-999999999999" },
        },
      ],
    },
    ID
  );

  assert.equal(r[0].argumentos.id_conversa, ID);
});

test("mais que três consultas é cortado", () => {
  const r = filtrarPlano(
    {
      consultas: [
        { nome: "consultar_cliente" },
        { nome: "consultar_memoria" },
        { nome: "consultar_pendencias" },
        { nome: "buscar_conhecimento", argumentos: { termo: "taxa" } },
        { nome: "consultar_simulacao" },
      ],
    },
    ID
  );

  assert.equal(r.length, 3, "cada consulta a mais é o cliente esperando mais");
});

test("lixo do modelo vira lista vazia, não exceção", () => {
  assert.deepEqual(filtrarPlano(null, ID), []);
  assert.deepEqual(filtrarPlano({}, ID), []);
  assert.deepEqual(filtrarPlano({ consultas: "buscar tudo" }, ID), []);
  assert.deepEqual(filtrarPlano({ consultas: [null, 42, {}] }, ID), []);
  assert.deepEqual(filtrarPlano({ consultas: [{ nome: 7 }] }, ID), []);
});

/* ------------------------------------------------- o que vai pro redator */

test("o conhecimento encontrado chega ao redator", () => {
  const texto = consultasEmTexto([
    {
      nome: "buscar_conhecimento",
      ok: true,
      dados: { achou: true, itens: [{ assunto: "Prazo", conteudo: "cai em 2 dias úteis" }] },
    },
  ]);

  assert.match(texto, /Prazo/);
  assert.match(texto, /2 dias/);
});

test("simulação indisponível vira aviso explícito de não escrever número", () => {
  // Sem esta linha o modelo trata o silêncio como permissão pra improvisar.
  const texto = consultasEmTexto([
    { nome: "consultar_simulacao", ok: true, dados: { disponivel: false } },
  ]);

  assert.match(texto, /NÃO tem o valor/);
});

test("consulta que falhou não vira texto", () => {
  const texto = consultasEmTexto([
    { nome: "buscar_conhecimento", ok: false, erro: "banco fora" },
  ]);

  assert.equal(texto, "");
});

test("sem consultas, sem texto", () => {
  assert.equal(consultasEmTexto([]), "");
  assert.equal(consultasEmTexto(null), "");
});
