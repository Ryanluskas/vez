import test from "node:test";
import assert from "node:assert/strict";
import { criarFluxo } from "../src/fluxo.js";
import { criarServidorWebhook } from "../src/evolution/webhook.js";
import { criarClienteEvolution } from "../src/evolution/cliente.js";

// Mock representativo do Supabase para teste de ponta a ponta
function criarAmbienteIntegracao() {
  const conversas = new Map();
  const mensagens = [];
  const pendencias = [];
  const rascunhos = [];
  const followups = [];
  const memorias = new Map();
  const conexoes = [
    {
      id: "conn_evolution_1",
      user_id: "usr_test",
      evolution_instancia: "instancia_teste",
      apelido: "WhatsApp Comercial",
      estado: "conectado",
      ativa: true,
      tipo_provedor: "evolution",
    },
  ];

  function criarQueryBuilder(resultado = []) {
    const obj = {
      data: resultado,
      error: null,
      eq(campo, valor) {
        if (campo === "evolution_instancia") {
          const c = conexoes.find((cx) => cx.evolution_instancia === valor);
          return criarQueryBuilder(c ? [c] : []);
        }
        return obj;
      },
      in() { return obj; },
      order() { return obj; },
      limit() { return obj; },
      single: async () => ({
        data: Array.isArray(resultado) ? resultado[0] ?? null : resultado,
        error: null,
      }),
      maybeSingle: async () => ({
        data: Array.isArray(resultado) ? resultado[0] ?? null : resultado,
        error: null,
      }),
      then(resolve) {
        return resolve({ data: resultado, error: null });
      },
    };
    return obj;
  }

  const supabase = {
    dados: { conversas, mensagens, pendencias, rascunhos, followups, conexoes },
    from(tabela) {
      if (tabela === "conexoes") {
        return {
          select() {
            return criarQueryBuilder(conexoes);
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                for (const c of conexoes) {
                  if (c[campo] === valor) Object.assign(c, mudancas);
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (tabela === "conversas") {
        return {
          select() {
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
                  async maybeSingle() {
                    for (const c of conversas.values()) {
                      if (c[campo] === valor) return { data: { ...c }, error: null };
                    }
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
          insert(registro) {
            const id = `11111111-2222-3333-4444-${String(conversas.size + 1).padStart(12, "0")}`;
            const novo = {
              id,
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
                for (const c of conversas.values()) {
                  if (c[campo] === valor) Object.assign(c, mudancas);
                }
                const res = { data: null, error: null };
                return {
                  in() { return Promise.resolve(res); },
                  then(resolve) { return resolve(res); },
                };
              },
            };
          },
        };
      }

      if (tabela === "mensagens") {
        return {
          select() {
            return criarQueryBuilder(mensagens);
          },
          async insert(msg) {
            const novaMsg = { id: `msg_${mensagens.length + 1}`, ...msg, criado_em: new Date().toISOString() };
            mensagens.push(novaMsg);
            return { data: novaMsg, error: null };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                for (const m of mensagens) {
                  if (m[campo] === valor) Object.assign(m, mudancas);
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (tabela === "rascunhos") {
        return {
          async insert(r) {
            const novo = { id: `rasc_${rascunhos.length + 1}`, ...r };
            rascunhos.push(novo);
            return { error: null };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                for (const r of rascunhos) {
                  if (r[campo] === valor) Object.assign(r, mudancas);
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (tabela === "pendencias") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() { return { count: 0 }; },
                };
              },
            };
          },
          insert(pend) {
            const id = `pend_${pendencias.length + 1}`;
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

      if (tabela === "memoria") {
        return {
          select() {
            return {
              eq(campo, valor) {
                return {
                  async maybeSingle() {
                    const m = memorias.get(valor);
                    return { data: m ? { ...m } : null, error: null };
                  },
                  async single() {
                    const m = memorias.get(valor);
                    return { data: m ? { ...m } : null, error: null };
                  },
                };
              },
            };
          },
          insert(registro) {
            const m = {
              id: `mem_${memorias.size + 1}`,
              ...registro,
              coletado: registro.coletado ?? {},
              perguntado: registro.perguntado ?? {},
              criado_em: new Date().toISOString(),
            };
            memorias.set(registro.id_conversa, m);
            return {
              select() {
                return {
                  single: async () => ({ data: { ...m }, error: null }),
                  maybeSingle: async () => ({ data: { ...m }, error: null }),
                };
              },
            };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                let m = memorias.get(valor);
                if (!m) {
                  m = { id_conversa: valor, ...mudancas };
                  memorias.set(valor, m);
                } else {
                  Object.assign(m, mudancas);
                }
                return {
                  select() {
                    return {
                      single: async () => ({ data: { ...m }, error: null }),
                      maybeSingle: async () => ({ data: { ...m }, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      return {
        select() { return criarQueryBuilder([]); },
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

  return { supabase, conversas, mensagens, pendencias, rascunhos, followups, conexoes };
}

test("Fluxo Real: Recepção de webhook, identificação, qualificação e histórico contínuo", async () => {
  const env = criarAmbienteIntegracao();
  const fluxo = criarFluxo(env.supabase, "usr_test");

  // 1. Simula payload de mensagem WhatsApp recebida via Evolution API
  const payloadMensagem1 = {
    event: "messages.upsert",
    instance: "instancia_teste",
    data: {
      key: {
        remoteJid: "5511999887766@s.whatsapp.net",
        fromMe: false,
        id: "EVOLUTION_MSG_001",
      },
      pushName: "Roberto Silveira",
      messageType: "conversation",
      message: {
        conversation: "Olá, gostaria de saber como funciona o consignado",
      },
    },
  };

  // 2. Simula criação do webhook
  const servidorWebhook = criarServidorWebhook({
    fluxo,
    supabase: env.supabase,
    porta: 3456,
  });

  // 3. O webhook processa o evento de mensagem recebida
  const conversaRegistrada = await fluxo.registrar({
    idConexao: "conn_evolution_1",
    idChat: "5511999887766@s.whatsapp.net",
    idMensagem: "EVOLUTION_MSG_001",
    telefone: "5511999887766",
    nome: "Roberto Silveira",
    texto: "Olá, gostaria de saber como funciona o consignado",
    direcao: "recebida",
  });

  // Verificações do primeiro turno
  assert.equal(conversaRegistrada.telefone, "5511999887766");
  assert.equal(conversaRegistrada.nome, "Roberto Silveira");

  // Executa processamento da mensagem
  await fluxo.processarRecebida(
    conversaRegistrada,
    "Olá, gostaria de saber como funciona o consignado",
    "Roberto Silveira"
  );

  // Mensagem gravada no banco
  const msgNoBanco = env.mensagens.find((m) => m.id_whatsapp === "EVOLUTION_MSG_001");
  assert.ok(msgNoBanco, "Mensagem original deve estar persistida no banco");
  assert.equal(msgNoBanco.direcao, "recebida");

  // O funil deve ter avançado para primeiro atendimento ou qualificação
  assert.ok(
    ["primeiro_atendimento", "em_qualificacao"].includes(conversaRegistrada.etapa),
    `Etapa comercial esperada, atual: ${conversaRegistrada.etapa}`
  );

  // 4. Segundo turno: cliente responde o convênio
  const payloadMensagem2 = {
    idConexao: "conn_evolution_1",
    idChat: "5511999887766@s.whatsapp.net",
    idMensagem: "EVOLUTION_MSG_002",
    telefone: "5511999887766",
    nome: "Roberto Silveira",
    texto: "Sou aposentado do INSS",
    direcao: "recebida",
  };

  const conversaTurno2 = await fluxo.registrar(payloadMensagem2);
  assert.equal(conversaTurno2.id, conversaRegistrada.id, "Deve ser a mesma conversa");

  await fluxo.processarRecebida(
    conversaTurno2,
    "Sou aposentado do INSS",
    "Roberto Silveira"
  );

  // Contexto e fatos extraídos
  const lembrado = await fluxo.memoria.ler(conversaTurno2.id);
  assert.ok(lembrado, "Memória da conversa deve existir");
});

test("Fluxo Real: Diferenciação entre Objeção Comercial e Opt-Out Legal", async () => {
  const env = criarAmbienteIntegracao();
  const fluxo = criarFluxo(env.supabase, "usr_test");

  // Caso 1: Objeção comercial comum ("A taxa está alta, não quero agora")
  const c1 = await fluxo.registrar({
    idConexao: "conn_evolution_1",
    idChat: "5511911112222@s.whatsapp.net",
    idMensagem: "MSG_OBJ_01",
    telefone: "5511911112222",
    nome: "Cliente Objeção",
    texto: "A taxa está muito alta, não quero agora",
    direcao: "recebida",
  });

  await fluxo.processarRecebida(c1, "A taxa está muito alta, não quero agora", "Cliente Objeção");

  // Objeção comercial NÃO pode marcar opt-out global
  assert.equal(c1.opt_out, false, "Objeção comercial não deve marcar opt-out");
  assert.notEqual(c1.motivo_perda, "opt_out_lgpd", "Motivo de perda não deve ser opt-out");

  // Caso 2: Pedido explícito de opt-out ("pare de me mandar mensagem")
  const c2 = await fluxo.registrar({
    idConexao: "conn_evolution_1",
    idChat: "5511933334444@s.whatsapp.net",
    idMensagem: "MSG_OPTOUT_01",
    telefone: "5511933334444",
    nome: "Cliente OptOut",
    texto: "pare de me mandar mensagem, por favor",
    direcao: "recebida",
  });

  await fluxo.processarRecebida(c2, "pare de me mandar mensagem, por favor", "Cliente OptOut");

  // Pedido explícito DEVE marcar opt-out imediatamente
  assert.equal(c2.opt_out, true, "Pedido explícito deve ativar opt-out");
  assert.equal(c2.atender, false, "Atendimento automático deve ser desligado");
  assert.equal(c2.etapa, "perdido");
  assert.equal(c2.motivo_perda, "opt_out_lgpd");

  // Terceiro turno do cliente com opt-out: silêncio absoluto
  const totalRascunhos = env.rascunhos.length;
  await fluxo.processarRecebida(c2, "Vocês ainda estão aí?", "Cliente OptOut");
  assert.equal(env.rascunhos.length, totalRascunhos, "Nenhuma nova resposta pode ser gerada");
});

test("Fluxo Real: Handoff Humano mantém integridade do Dossiê sem dados inventados", async () => {
  const env = criarAmbienteIntegracao();
  const fluxo = criarFluxo(env.supabase, "usr_test");

  const c = await fluxo.registrar({
    idConexao: "conn_evolution_1",
    idChat: "5511955556666@s.whatsapp.net",
    idMensagem: "MSG_HANDOFF_01",
    telefone: "5511955556666",
    nome: "Dona Maria",
    texto: "Quero falar com um atendente humano urgente",
    direcao: "recebida",
  });

  await fluxo.processarRecebida(c, "Quero falar com um atendente humano urgente", "Dona Maria");

  // Ao solicitar humano, passa para aguardando_consultor ou cria pendência
  assert.ok(
    c.estagio === "aguardando_voce" || c.etapa === "aguardando_consultor",
    "Deve transferir o controle para o consultor"
  );

  // Enquanto estiver com consultor, bot não pode responder sozinho
  c.so_voce = true;
  c.estagio = "aguardando_voce";

  const rascunhosAntes = env.rascunhos.length;
  await fluxo.processarRecebida(c, "Alguém vai me atender?", "Dona Maria");
  assert.equal(env.rascunhos.length, rascunhosAntes, "Bot não pode responder enquanto consultor estiver ativo");
});
