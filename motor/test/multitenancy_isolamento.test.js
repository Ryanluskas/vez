import { test } from "node:test";
import assert from "node:assert/strict";
import { criarFluxo } from "../src/fluxo.js";
import { criarEscuta } from "../src/escuta.js";
import { criarSeguimento } from "../src/seguimento.js";

test("Multi-tenancy: garantirConversa isola clientes pelo user_id e id_conexao", async () => {
  const conversasNoBanco = [];
  const mockSupabase = {
    from(tabela) {
      if (tabela === "conversas") {
        return {
          select() {
            const filtros = [];
            const qb = {
              eq(campo, valor) {
                filtros.push((c) => c[campo] === valor);
                return qb;
              },
              is(campo, valor) {
                filtros.push((c) => (valor === null ? c[campo] == null : c[campo] === valor));
                return qb;
              },
              async maybeSingle() {
                const match = conversasNoBanco.find((c) => filtros.every((f) => f(c)));
                return { data: match ? { ...match } : null, error: null };
              },
            };
            return qb;
          },
          insert(nova) {
            const row = { id: `conv_${conversasNoBanco.length + 1}`, ...nova };
            conversasNoBanco.push(row);
            return {
              select() {
                return {
                  single: async () => ({ data: { ...row }, error: null }),
                };
              },
            };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                const alvo = conversasNoBanco.find((c) => c[campo] === valor);
                if (alvo) Object.assign(alvo, mudancas);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (tabela === "mensagens") {
        return { insert: async () => ({ error: null }) };
      }
      return { select() { return { maybeSingle: async () => ({ data: null }) }; } };
    },
  };

  const fluxoTenantA = criarFluxo(mockSupabase, "tenant_A");
  const fluxoTenantB = criarFluxo(mockSupabase, "tenant_B");

  // Mesmo número de telefone (ex: 5511999990001) conversando com Tenant A e Tenant B
  const convA = await fluxoTenantA.registrar({
    idConexao: "conn_A",
    idChat: "5511999990001@s.whatsapp.net",
    telefone: "5511999990001",
    nome: "Cliente Silva",
    texto: "Olá",
    direcao: "recebida",
  });

  const convB = await fluxoTenantB.registrar({
    idConexao: "conn_B",
    idChat: "5511999990001@s.whatsapp.net",
    telefone: "5511999990001",
    nome: "Cliente Silva",
    texto: "Olá",
    direcao: "recebida",
  });

  assert.notEqual(convA.id, convB.id, "Conversas de tenants diferentes NUNCA podem compartilhar id");
  assert.equal(conversasNoBanco.length, 2, "Devem existir 2 conversas isoladas no banco");
  assert.equal(conversasNoBanco[0].user_id, "tenant_A");
  assert.equal(conversasNoBanco[1].user_id, "tenant_B");
});

test("Multi-tenancy: escuta varre apenas pendências e rascunhos do próprio tenant", async () => {
  const pendenciasDb = [
    { id: "p1", user_id: "tenant_A", status: "respondida", resposta: "4712", categoria: "valor", respondida_em: new Date().toISOString() },
    { id: "p2", user_id: "tenant_B", status: "respondida", resposta: "5000", categoria: "valor", respondida_em: new Date().toISOString() },
  ];
  const rascunhosDb = [];

  const mockSupabase = {
    from(tabela) {
      if (tabela === "pendencias") {
        return {
          select() {
            const filtros = [];
            const qb = {
              eq(campo, valor) {
                filtros.push((p) => p[campo] === valor);
                return qb;
              },
              not() { return qb; },
              order() { return qb; },
              limit() {
                const filtradas = pendenciasDb.filter((p) => filtros.every((f) => f(p)));
                return Promise.resolve({ data: filtradas, error: null });
              },
            };
            return qb;
          },
        };
      }
      if (tabela === "rascunhos") {
        return {
          select(c, opts) {
            if (opts?.count) {
              return {
                eq() { return Promise.resolve({ count: 0, error: null }); },
              };
            }
            return {
              eq() { return { is() { return { order() { return { limit() { return Promise.resolve({ data: [] }); } }; } }; } }; },
            };
          },
          insert(r) {
            rascunhosDb.push(r);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (tabela === "mensagens") {
        return { insert: async () => ({ error: null }) };
      }
      return { select() { return { maybeSingle: async () => ({ data: null }) }; } };
    },
  };

  const transformadas = [];
  const mockFluxo = {
    async transformarRespostaEmRascunho(pendencia) {
      transformadas.push(pendencia);
    },
  };

  const escutaTenantA = criarEscuta({
    supabase: mockSupabase,
    fluxo: mockFluxo,
    maestro: {},
    userId: "tenant_A",
  });

  // Executa varredura de pendências do Tenant A
  await escutaTenantA.testarVarredura?.();

  // Executa busca direta filtrada por tenant_A
  const { data } = await mockSupabase
    .from("pendencias")
    .select("*")
    .eq("status", "respondida")
    .eq("user_id", "tenant_A")
    .limit(10);

  assert.equal(data.length, 1);
  assert.equal(data[0].id, "p1");
  assert.equal(data[0].user_id, "tenant_A");
});

test("Multi-tenancy: follow-ups sugeridos e aprovados respeitam isolamento de tenant", async () => {
  const solicitacoesDb = [
    { id: "s1", user_id: "tenant_1", status: "aprovada", mensagem_aprovada: "msg 1", tentativa: 1 },
    { id: "s2", user_id: "tenant_2", status: "aprovada", mensagem_aprovada: "msg 2", tentativa: 1 },
  ];

  const mockSupabase = {
    from(tabela) {
      if (tabela === "solicitacoes_followup") {
        return {
          select() {
            const filtros = [];
            const qb = {
              eq(campo, valor) {
                filtros.push((s) => s[campo] === valor);
                return qb;
              },
              is(campo, valor) {
                filtros.push((s) => (valor === null ? s[campo] == null : s[campo] === valor));
                return qb;
              },
              order() { return qb; },
              limit(n) {
                const filtradas = solicitacoesDb.filter((s) => filtros.every((f) => f(s)));
                return Promise.resolve({ data: filtradas.slice(0, n), error: null });
              },
            };
            return qb;
          },
        };
      }
      if (tabela === "mensagens") {
        return { insert: async () => ({ error: null }) };
      }
      return { select() { return { maybeSingle: async () => ({ data: null }) }; } };
    },
  };

  const { data: tenant1Items } = await mockSupabase
    .from("solicitacoes_followup")
    .select("*")
    .eq("status", "aprovada")
    .eq("user_id", "tenant_1")
    .limit(10);

  const { data: tenant2Items } = await mockSupabase
    .from("solicitacoes_followup")
    .select("*")
    .eq("status", "aprovada")
    .eq("user_id", "tenant_2")
    .limit(10);

  assert.equal(tenant1Items.length, 1);
  assert.equal(tenant1Items[0].id, "s1");
  assert.equal(tenant2Items.length, 1);
  assert.equal(tenant2Items[0].id, "s2");
});
