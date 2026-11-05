import test from "node:test";
import assert from "node:assert/strict";
import { criarFluxo } from "../src/fluxo.js";

// Mock Supabase para testes E2E do fluxo comercial
function criarSupabaseMock() {
  const conversas = new Map();
  const mensagens = [];
  const pendencias = [];
  const rascunhos = [];
  const followups = [];

  function criarQueryBuilder(resultado = []) {
    const obj = {
      data: resultado,
      error: null,
      eq() { return obj; },
      in() { return obj; },
      order() { return obj; },
      limit() { return obj; },
      single: async () => ({ data: Array.isArray(resultado) ? resultado[0] ?? null : resultado, error: null }),
      maybeSingle: async () => ({ data: Array.isArray(resultado) ? resultado[0] ?? null : resultado, error: null }),
      then(resolve) { return resolve({ data: resultado, error: null }); },
    };
    return obj;
  }

  return {
    dados: { conversas, mensagens, pendencias, rascunhos, followups },
    from(tabela) {
      if (tabela === "conversas") {
        return {
          select(campos) {
            return {
              eq(campo, valor) {
                return {
                  eq(campo2, valor2) {
                    return {
                      async maybeSingle() {
                        for (const c of conversas.values()) {
                          if (c[campo] === valor && c[campo2] === valor2) {
                            return { data: { ...c }, error: null };
                          }
                        }
                        return { data: null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(registro) {
            const id = `conv_${Date.now()}_${Math.random()}`;
            const novo = {
              id,
              atender: true,
              opt_out: false,
              etapa: "novo_contato",
              ...registro,
              atualizado_em: new Date().toISOString(),
            };
            conversas.set(id, novo);
            return {
              select() {
                return {
                  single: async () => ({ data: { ...novo }, error: null }),
                };
              },
            };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                return {
                  in() {
                    return this;
                  },
                  async then(resolve) {
                    for (const [id, c] of conversas.entries()) {
                      if (c[campo] === valor) {
                        Object.assign(c, mudancas);
                      }
                    }
                    resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (tabela === "mensagens") {
        return {
          select() {
            return criarQueryBuilder([]);
          },
          async insert(msg) {
            mensagens.push(msg);
            return { error: null };
          },
        };
      }

      if (tabela === "pendencias") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return { count: 0 };
                  },
                };
              },
            };
          },
          insert(pend) {
            const id = `pend_${Date.now()}`;
            pendencias.push({ id, ...pend });
            return {
              select() {
                return {
                  single: async () => ({ data: { id }, error: null }),
                };
              },
            };
          },
        };
      }

      if (tabela === "rascunhos") {
        return {
          select(campos, opcoes) {
            let resultado = [...rascunhos];
            const builder = {
              eq(campo, valor) {
                resultado = resultado.filter((r) => r[campo] === valor);
                return builder;
              },
              order() { return builder; },
              limit(n) { resultado = resultado.slice(0, n); return builder; },
              then(resolve) {
                return resolve({
                  data: resultado,
                  count: resultado.length,
                  error: null,
                });
              },
            };
            return builder;
          },
          async insert(r) {
            rascunhos.push(r);
            return { error: null };
          },
        };
      }

      if (tabela === "solicitacoes_followup") {
        return {
          update(mudancas) {
            return {
              eq(campo, valor) {
                return {
                  in() {
                    for (const f of followups) {
                      if (f[campo] === valor) Object.assign(f, mudancas);
                    }
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      // Tabelas auxiliares
      return {
        select() {
          return criarQueryBuilder([]);
        },
        insert() {
          return {
            select() {
              return {
                single: async () => ({ data: { id: "mock_id", coletado: {} }, error: null }),
              };
            },
            then: (res) => res({ data: null, error: null }),
          };
        },
        update() {
          const u = {
            eq() { return u; },
            in() { return u; },
            select() { return u; },
            single: async () => ({ data: { id: "mock_id" }, error: null }),
            then: (res) => res({ data: null, error: null }),
          };
          return u;
        },
      };
    },
  };
}

test("Fluxo Comercial E2E: Criação de contato e transição para primeiro atendimento", async () => {
  const sb = criarSupabaseMock();
  const fluxo = criarFluxo(sb, "usr_123");

  const conversa = await fluxo.registrar({
    idConexao: "conn_1",
    telefone: "5511999998888",
    nome: "Carlos Eduardo",
    texto: "Olá, gostaria de saber sobre consignado",
    direcao: "recebida",
  });

  assert.equal(conversa.telefone, "5511999998888");
  assert.equal(conversa.etapa, "novo_contato");

  // Ao processar recebida, o funil avança para primeiro_atendimento e em_qualificacao
  await fluxo.processarRecebida(conversa, "Olá, gostaria de saber sobre consignado", "Carlos Eduardo");
  assert.ok(
    ["primeiro_atendimento", "em_qualificacao"].includes(conversa.etapa),
    `Etapa atual deve ser primeiro_atendimento ou em_qualificacao, obtido: ${conversa.etapa}`
  );
});

test("Fluxo Comercial E2E: LGPD Opt-out com comando 'pare' bloqueia bot e cancela follow-ups", async () => {
  const sb = criarSupabaseMock();
  const fluxo = criarFluxo(sb, "usr_123");

  const conversa = await fluxo.registrar({
    idConexao: "conn_1",
    telefone: "5511988887777",
    nome: "Juliana Santos",
    texto: "pare",
    direcao: "recebida",
  });

  await fluxo.processarRecebida(conversa, "pare", "Juliana Santos");

  assert.equal(conversa.opt_out, true);
  assert.equal(conversa.atender, false);
  assert.equal(conversa.etapa, "perdido");

  // Rascunho de confirmação educada enfileirado
  const rascunhoOptOut = sb.dados.rascunhos.find((r) => r.categoria === "opt_out");
  assert.ok(rascunhoOptOut, "Rascunho de opt-out deve existir");
  assert.ok(rascunhoOptOut.texto_sugerido.includes("descadastrado"));
});

test("Fluxo Comercial E2E: Contato com opt_out ativo tem respostas automáticas suprimidas", async () => {
  const sb = criarSupabaseMock();
  const fluxo = criarFluxo(sb, "usr_123");

  const conversa = await fluxo.registrar({
    idConexao: "conn_1",
    telefone: "5511977776666",
    nome: "Marcos Lima",
    texto: "teste",
    direcao: "recebida",
  });

  conversa.opt_out = true;

  const totalRascunhosAntes = sb.dados.rascunhos.length;
  await fluxo.processarRecebida(conversa, "Boa tarde, qual a taxa?", "Marcos Lima");

  // Nenhuma resposta ou rascunho deve ser gerado
  assert.equal(sb.dados.rascunhos.length, totalRascunhosAntes);
});

test("Fluxo Comercial E2E: Objeção 'não tenho interesse' encerra atendimento sem opt-out permanente", async () => {
  const sb = criarSupabaseMock();
  const fluxo = criarFluxo(sb, "usr_123");

  const conversa = await fluxo.registrar({
    idConexao: "conn_1",
    telefone: "5511966665555",
    nome: "Fernanda Costa",
    texto: "não tenho interesse obrigado",
    direcao: "recebida",
  });

  // Primeira objeção aciona contorno persuasivo sem desativar o lead
  await fluxo.processarRecebida(conversa, "não tenho interesse obrigado", "Fernanda Costa");
  assert.equal(conversa.opt_out, false, "Objeção comercial não bloqueia opt_out LGPD permanente");

  // Reiteração da recusa encerra respeitosamente sem opt-out permanente
  await fluxo.processarRecebida(conversa, "não quero mesmo", "Fernanda Costa");
  assert.equal(conversa.atender, false);
  assert.equal(conversa.etapa, "perdido");
});

test("Fluxo Comercial E2E: Pedido explícito aciona opt-out LGPD estrito", async () => {
  const sb = criarSupabaseMock();
  const fluxo = criarFluxo(sb, "usr_123");

  const conversa = await fluxo.registrar({
    idConexao: "conn_1",
    telefone: "5511977778888",
    nome: "Carlos Eduardo",
    texto: "Favor tirar meu número da lista, pare de me mandar mensagens",
    direcao: "recebida",
  });

  await fluxo.processarRecebida(conversa, "Favor tirar meu número da lista, pare de me mandar mensagens", "Carlos Eduardo");

  assert.equal(conversa.opt_out, true, "Descadastramento explícito deve ativar opt_out legal");
  assert.equal(conversa.atender, false);
  assert.equal(conversa.etapa, "perdido");
});
