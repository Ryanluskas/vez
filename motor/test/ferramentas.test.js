import test from "node:test";
import assert from "node:assert/strict";
import { FERRAMENTAS, validarArgumentos, catalogo } from "../src/agente/ferramentas.js";
import { criarExecutor, comTempoLimite, LIMITE_DE_CHAMADAS } from "../src/agente/executor.js";

/*
  As ferramentas são o ponto onde o agente deixa de opinar e passa a mexer
  no atendimento de verdade. O que estes testes protegem não é se elas
  funcionam — é o que acontece quando algo dá errado: modelo pedindo
  ferramenta que não existe, argumento com valor inventado, chamada repetida,
  banco pendurado, ciclo infinito.
*/

const ID = "11111111-2222-3333-4444-555555555555";

/*
  Supabase de mentira. Os builders do Supabase são "thenable" — dá pra dar
  await neles — então imitar isso é o suficiente pra rodar as ferramentas
  de verdade, sem rede e em milissegundos.
*/
function bancoFalso(respostas = {}) {
  const feito = [];

  function builder(tabela) {
    const passos = { tabela, ops: [] };
    const b = {
      then(resolver, rejeitar) {
        feito.push(passos);
        const r = respostas[tabela] ?? { data: null, error: null, count: 0 };
        const valor = typeof r === "function" ? r(passos) : r;
        return Promise.resolve(valor).then(resolver, rejeitar);
      },
    };
    for (const m of [
      "select", "insert", "update", "delete", "eq", "in", "or",
      "ilike", "order", "limit", "not", "maybeSingle", "single",
    ]) {
      b[m] = (...args) => {
        passos.ops.push([m, ...args]);
        return b;
      };
    }
    return b;
  }

  return { from: (t) => builder(t), _feito: feito };
}

function memoriaFalsa(inicial = {}) {
  let estado = { id_conversa: ID, coletado: {}, perguntado: {}, ...inicial };
  const chamadas = [];

  return {
    _estado: () => estado,
    _chamadas: () => chamadas,
    async ler() {
      return estado;
    },
    async aprender(_id, novos) {
      chamadas.push(novos);
      for (const c of ["nome", "convenio", "banco", "objetivo"]) {
        if (!estado[c] && novos[c]) estado[c] = novos[c];
      }
      if (novos.coletado) estado.coletado = { ...estado.coletado, ...novos.coletado };
      return estado;
    },
    async confirmarPeloUltimoPedido() {
      chamadas.push("ultimo_pedido");
      return estado;
    },
  };
}

/* ------------------------------------------------- validação de argumentos */

test("id que não é id não passa", () => {
  const r = validarArgumentos(FERRAMENTAS.consultar_cliente, { id_conversa: "o cliente" });
  assert.equal(r.ok, false);
  assert.match(r.problemas[0], /id/);
});

test("argumento obrigatório que falta é apontado pelo nome", () => {
  const r = validarArgumentos(FERRAMENTAS.marcar_informacao_coletada, { id_conversa: ID });
  assert.equal(r.ok, false);
  assert.match(r.problemas.join(" "), /falta chave/);
});

test("etapa inventada não passa", () => {
  const r = validarArgumentos(FERRAMENTAS.atualizar_etapa, {
    id_conversa: ID,
    etapa: "quase_fechando",
  });
  assert.equal(r.ok, false);
});

test("requisito que a operação não usa não passa", () => {
  const r = validarArgumentos(FERRAMENTAS.marcar_informacao_coletada, {
    id_conversa: ID,
    chave: "certidao_de_nascimento",
  });
  assert.equal(r.ok, false);
});

test("argumento a mais é descartado, não derruba a chamada", () => {
  // O modelo acrescenta campo de vez em quando. Perder o atendimento por
  // causa disso seria trocar um detalhe por uma falha.
  const r = validarArgumentos(FERRAMENTAS.atualizar_etapa, {
    id_conversa: ID,
    etapa: "conversando",
    confianca: 0.9,
  });
  assert.equal(r.ok, true, r.problemas.join("; "));
  assert.deepEqual(Object.keys(r.argumentos).sort(), ["etapa", "id_conversa"]);
});

test("padrão entra quando o campo não vem", () => {
  const r = validarArgumentos(FERRAMENTAS.marcar_informacao_coletada, {
    id_conversa: ID,
    chave: "margem",
  });
  assert.equal(r.argumentos.como, "cliente");
});

/* ----------------------------------------------------------- regra de ouro */

test("a IA não consegue guardar um valor na memória do cliente", () => {
  const r = validarArgumentos(FERRAMENTAS.atualizar_memoria, {
    id_conversa: ID,
    banco: "Santander, liberou 4200",
  });
  assert.equal(r.ok, false);
  assert.match(r.problemas.join(" "), /dinheiro/);
});

test("nem uma taxa disfarçada de objetivo", () => {
  const r = validarArgumentos(FERRAMENTAS.atualizar_memoria, {
    id_conversa: ID,
    objetivo: "quer taxa de 1,49%",
  });
  assert.equal(r.ok, false);
});

test("fato normal do cliente passa", () => {
  const r = validarArgumentos(FERRAMENTAS.atualizar_memoria, {
    id_conversa: ID,
    convenio: "inss",
    banco: "Santander",
  });
  assert.equal(r.ok, true, r.problemas.join("; "));
});

test("a simulação diz que não existe, em vez de devolver número", async () => {
  const r = await FERRAMENTAS.consultar_simulacao.executar({ id_conversa: ID }, {});
  assert.equal(r.disponivel, false);
  assert.equal(r.proximo_passo, "solicitar_intervencao");
  assert.equal(/\d/.test(JSON.stringify(r)), false, "não pode ter número nenhum");
});

test("nenhuma ferramenta aceita argumento de valor, parcela ou taxa", () => {
  const proibidos = ["valor", "parcela", "taxa", "margem", "saldo", "juros"];
  for (const [nome, d] of Object.entries(FERRAMENTAS)) {
    for (const arg of Object.keys(d.argumentos ?? {})) {
      assert.equal(
        proibidos.includes(arg),
        false,
        `${nome} tem um argumento "${arg}" — esse dado não pode entrar por ferramenta`
      );
    }
  }
});

/* ------------------------------------------------------------- o executor */

test("ferramenta que não existe devolve erro, não estoura", async () => {
  const ciclo = criarExecutor({}).novoCiclo();
  const r = await ciclo.usar("mandar_pix", { valor: 500 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /não existe/);
});

test("a mesma chamada duas vezes só executa uma", async () => {
  const memoria = memoriaFalsa();
  const banco = bancoFalso({ conversas: { error: null } });
  const ciclo = criarExecutor({ supabase: banco, memoria }).novoCiclo();

  const a = await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  const b = await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.repetida, true);
  assert.equal(memoria._chamadas().length, 1, "gravou duas vezes o mesmo documento");
});

test("ordem dos argumentos não engana a proteção", async () => {
  const memoria = memoriaFalsa();
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  const b = await ciclo.usar("marcar_informacao_coletada", { chave: "margem", id_conversa: ID });

  assert.equal(b.repetida, true);
});

test("duas pendências para o mesmo cliente no mesmo ciclo: uma só", async () => {
  let aberturas = 0;
  const ciclo = criarExecutor({
    memoria: memoriaFalsa(),
    contextoDaConversa: async () => "Cliente: quanto libera?",
    abrirPendencia: async () => {
      aberturas++;
      return "pendencia-1";
    },
  }).novoCiclo();

  const args = { id_conversa: ID, pergunta: "quanto libera?", motivo: "valor" };
  await ciclo.usar("solicitar_intervencao", args);
  await ciclo.usar("solicitar_intervencao", args);

  assert.equal(aberturas, 1, "o cliente apareceria duas vezes na fila");
});

test("chamada diferente depois de uma repetida ainda roda", async () => {
  const memoria = memoriaFalsa();
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  const c = await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "contracheque" });

  assert.equal(c.ok, true);
  assert.equal(c.repetida, undefined);
  assert.equal(memoria._chamadas().length, 2);
});

test("passou do limite, o ciclo para", async () => {
  const memoria = memoriaFalsa();
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  const chaves = ["convenio", "banco", "contracheque", "margem", "documento_foto", "comprovante_endereco", "conta_bancaria"];
  const saidas = [];
  for (const chave of chaves) {
    saidas.push(await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave }));
  }

  const passaram = saidas.filter((s) => s.ok).length;
  assert.equal(passaram, LIMITE_DE_CHAMADAS);
  assert.equal(saidas[LIMITE_DE_CHAMADAS].limite, true);
});

test("ferramenta que quebra vira resposta, não exceção", async () => {
  const ciclo = criarExecutor({
    supabase: bancoFalso({ conversas: { error: { message: "banco fora do ar" } } }),
  }).novoCiclo();

  const r = await ciclo.usar("atualizar_etapa", { id_conversa: ID, etapa: "em_analise" });
  assert.equal(r.ok, false);
  assert.match(r.erro, /banco fora do ar/);
});

test("promessa que nunca resolve é cortada pelo tempo limite", async () => {
  // Supabase de graça hiberna: a consulta sai e não volta. Sem corte, a
  // mensagem do cliente fica presa esperando por minutos.
  await assert.rejects(
    () => comTempoLimite(new Promise(() => {}), 30, "consulta_travada"),
    /consulta_travada passou de/
  );
});

test("promessa que responde a tempo passa intacta", async () => {
  const r = await comTempoLimite(Promise.resolve({ certo: true }), 500, "rapida");
  assert.deepEqual(r, { certo: true });
});

test("o registro guarda o que rodou", async () => {
  const ciclo = criarExecutor({ memoria: memoriaFalsa() }).novoCiclo();
  await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  await ciclo.usar("nao_existe", {});

  const registro = ciclo.registro();
  assert.equal(registro.length, 1, "só o que de fato executou entra no registro");
  assert.equal(registro[0].nome, "marcar_informacao_coletada");
  assert.equal(typeof registro[0].ms, "number");
});

test("log que falha não derruba a ferramenta", async () => {
  const banco = bancoFalso({
    acoes_do_agente: () => {
      throw new Error("tabela não existe");
    },
  });
  const ciclo = criarExecutor({
    supabase: banco,
    userId: "u1",
    memoria: memoriaFalsa(),
  }).novoCiclo();

  const r = await ciclo.usar("marcar_informacao_coletada", { id_conversa: ID, chave: "margem" });
  assert.equal(r.ok, true, "o registro é pra depois; o atendimento é pra agora");
});

/* --------------------------------------------------- as ferramentas em si */

test("consultar_pendencias diz o que falta e o que dá pra pedir agora", async () => {
  const memoria = memoriaFalsa({ convenio: "inss" });
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  const r = await ciclo.usar("consultar_pendencias", { id_conversa: ID });

  assert.equal(r.ok, true);
  assert.equal(r.dados.pronto, false);
  assert.equal(
    r.dados.falta.some((f) => f.chave === "convenio"),
    false,
    "pediu de novo o que o cliente já disse"
  );
  assert.ok(r.dados.posso_pedir.chaves.length <= 2, "não vira formulário");
});

test("consultar_pendencias com tudo na mão libera a simulação", async () => {
  const confirmado = { confirmado: true, como: "cliente" };
  const memoria = memoriaFalsa({
    convenio: "inss",
    banco: "Santander",
    coletado: { contracheque: confirmado, margem: confirmado },
  });
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  const r = await ciclo.usar("consultar_pendencias", { id_conversa: ID });
  assert.equal(r.dados.pronto, true);
  assert.equal(r.dados.posso_pedir, null);
});

test("o bot não pode marcar a venda como fechada", async () => {
  const ciclo = criarExecutor({ supabase: bancoFalso() }).novoCiclo();

  const r = await ciclo.usar("atualizar_etapa", { id_conversa: ID, etapa: "fechado" });
  assert.equal(r.ok, true);
  assert.equal(r.dados.mudou, false, "o bot não vê o resultado da proposta");
});

test("buscar_conhecimento sem manual responde que não sabe", async () => {
  const ciclo = criarExecutor({
    supabase: bancoFalso({ conhecimento: { data: null, error: { message: "no table" } } }),
  }).novoCiclo();

  const r = await ciclo.usar("buscar_conhecimento", { termo: "prazo" });
  assert.equal(r.ok, true);
  assert.equal(r.dados.achou, false);
});

test("atualizar_memoria não sobrescreve o que o cliente já disse", async () => {
  const memoria = memoriaFalsa({ banco: "Santander" });
  const ciclo = criarExecutor({ memoria }).novoCiclo();

  const r = await ciclo.usar("atualizar_memoria", { id_conversa: ID, banco: "Bradesco" });

  assert.equal(r.dados.gravou, false);
  assert.equal(memoria._estado().banco, "Santander", "o primeiro relato vale mais");
});

/* ---------------------------------------------------------------- catálogo */

test("o catálogo de leitura não expõe nenhuma escrita", () => {
  const nomes = catalogo({ apenasLeitura: true }).map((f) => f.nome);
  for (const nome of nomes) {
    assert.equal(FERRAMENTAS[nome].escrita, false, `${nome} escreve e está no catálogo de leitura`);
  }
  assert.equal(nomes.includes("solicitar_intervencao"), false);
});

test("o catálogo marca a simulação como indisponível", () => {
  const simulacao = catalogo().find((f) => f.nome === "consultar_simulacao");
  assert.equal(simulacao.disponivel, false);
});
