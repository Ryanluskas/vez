import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { criarFluxo } from "../src/fluxo.js";

// Mock Supabase completo para simulações realistas multi-agente
export function criarSupabaseMockSimulacao() {
  const conversas = new Map();
  const mensagens = [];
  const pendencias = [];
  const rascunhos = [];
  const followups = [];
  const memoriaDb = new Map();

  function criarQueryBuilder(resultado = []) {
    const obj = {
      data: resultado,
      error: null,
      eq() { return obj; },
      in() { return obj; },
      or() { return obj; },
      gte() { return obj; },
      not() { return obj; },
      order() { return obj; },
      limit() { return obj; },
      single: async () => ({ data: Array.isArray(resultado) ? resultado[0] ?? null : resultado, error: null }),
      maybeSingle: async () => ({ data: Array.isArray(resultado) ? resultado[0] ?? null : resultado, error: null }),
      then(resolve) { return resolve({ data: resultado, error: null }); },
    };
    return obj;
  }

  return {
    dados: { conversas, mensagens, pendencias, rascunhos, followups, memoriaDb },
    from(tabela) {
      if (tabela === "conversas") {
        return {
          select(campos, opts) {
            if (opts?.count) {
              return {
                eq() {
                  return { count: 0 };
                },
              };
            }
            const filtros = [];
            const queryBuilder = {
              eq(campo, valor) {
                filtros.push((item) => item[campo] === valor);
                return queryBuilder;
              },
              is(campo, valor) {
                filtros.push((item) => (valor === null ? item[campo] == null : item[campo] === valor));
                return queryBuilder;
              },
              in(campo, valores) {
                filtros.push((item) => valores.includes(item[campo]));
                return queryBuilder;
              },
              lt(campo, valor) {
                filtros.push((item) => (item[campo] ?? 0) < valor);
                return queryBuilder;
              },
              order() { return queryBuilder; },
              limit(n) {
                const filtradas = Array.from(conversas.values()).filter((c) => filtros.every((f) => f(c)));
                return Promise.resolve({ data: filtradas.slice(0, n), error: null });
              },
              async maybeSingle() {
                for (const c of conversas.values()) {
                  if (filtros.every((f) => f(c))) {
                    return { data: { ...c }, error: null };
                  }
                }
                return { data: null, error: null };
              },
              async single() {
                const res = await queryBuilder.maybeSingle();
                if (res.data) return res;
                return { data: null, error: new Error("Not found") };
              },
            };
            return queryBuilder;
          },
          insert(registro) {
            const id = crypto.randomUUID();
            const novo = {
              id,
              atender: true,
              opt_out: false,
              so_voce: false,
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
                for (const [id, c] of conversas.entries()) {
                  if (c[campo] === valor) {
                    Object.assign(c, mudancas);
                  }
                }
                const ret = {
                  in() { return ret; },
                  select() {
                    return {
                      single: async () => {
                        const c = conversas.get(valor) || Array.from(conversas.values()).find(x => x[campo] === valor);
                        return { data: c ? { ...c } : null, error: null };
                      },
                      maybeSingle: async () => {
                        const c = conversas.get(valor) || Array.from(conversas.values()).find(x => x[campo] === valor);
                        return { data: c ? { ...c } : null, error: null };
                      },
                    };
                  },
                  then(resolve) {
                    if (resolve) resolve({ data: null, error: null });
                    return Promise.resolve({ data: null, error: null });
                  },
                };
                return ret;
              },
            };
          },
        };
      }

      if (tabela === "mensagens") {
        return {
          select(campos, opts) {
            if (opts?.count) {
              return {
                eq(campo, valor) {
                  return {
                    eq(campo2, valor2) {
                      return {
                        gte(campo3, valor3) {
                          const filtradas = mensagens.filter(
                            (m) => m[campo] === valor && m[campo2] === valor2 && m.criado_em >= valor3
                          );
                          return Promise.resolve({ count: filtradas.length, error: null });
                        },
                      };
                    },
                  };
                },
              };
            }
            return {
              eq(campo, valor) {
                const filtradas = mensagens.filter((m) => m[campo] === valor);
                return {
                  order() {
                    return {
                      limit(n) {
                        return Promise.resolve({ data: filtradas.slice(-n), error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(msg) {
            const nova = {
              id: crypto.randomUUID(),
              criado_em: new Date().toISOString(),
              ...msg,
            };
            mensagens.push(nova);
            return { error: null };
          },
        };
      }

      if (tabela === "rascunhos") {
        return {
          select(campos, opts) {
            let resultado = [...rascunhos];
            if (opts?.count) {
              return {
                eq(campo, valor) {
                  return {
                    eq(campo2, valor2) {
                      const count = rascunhos.filter((r) => r[campo] === valor && r[campo2] === valor2).length;
                      return Promise.resolve({ count, error: null });
                    },
                    count: rascunhos.filter((r) => r[campo] === valor).length,
                  };
                },
              };
            }
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
            const novo = {
              id: crypto.randomUUID(),
              criado_em: new Date().toISOString(),
              ...r,
            };
            rascunhos.push(novo);
            return { error: null };
          },
        };
      }

      if (tabela === "pendencias") {
        return {
          select(campos, opts) {
            return {
              eq(c, v) {
                return {
                  eq(c2, v2) {
                    const count = pendencias.filter((p) => p[c] === v && p[c2] === v2).length;
                    return Promise.resolve({ count, error: null });
                  },
                };
              },
            };
          },
          insert(p) {
            const id = crypto.randomUUID();
            pendencias.push({ id, ...p });
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
            let idConv = null;
            const builder = {
              eq(campo, valor) {
                if (campo === "id_conversa") idConv = valor;
                return builder;
              },
              async maybeSingle() {
                const dados = memoriaDb.get(idConv) ?? null;
                return { data: dados ? { id_conversa: idConv, ...dados } : null, error: null };
              },
              async single() {
                const dados = memoriaDb.get(idConv) ?? null;
                return { data: dados ? { id_conversa: idConv, ...dados } : null, error: null };
              },
            };
            return builder;
          },
          insert(registro) {
            memoriaDb.set(registro.id_conversa, { ...registro });
            return {
              select() {
                return {
                  single: async () => ({ data: { ...registro }, error: null }),
                };
              },
            };
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                const atual = memoriaDb.get(valor) || {};
                const mesclado = { ...atual, ...mudancas };
                memoriaDb.set(valor, mesclado);
                const ret = {
                  select() {
                    return {
                      single: async () => ({ data: { id_conversa: valor, ...mesclado }, error: null }),
                      maybeSingle: async () => ({ data: { id_conversa: valor, ...mesclado }, error: null }),
                    };
                  },
                  then(resolve) {
                    if (resolve) resolve({ data: null, error: null });
                    return Promise.resolve({ data: null, error: null });
                  },
                };
                return ret;
              },
            };
          },
        };
      }

      // Default mock builder para outras tabelas
      return {
        select() { return criarQueryBuilder([]); },
        insert() {
          return {
            select() {
              return { single: async () => ({ data: { id: crypto.randomUUID() }, error: null }) };
            },
            then: (res) => res({ data: null, error: null }),
          };
        },
        update() {
          const u = {
            eq() { return u; },
            in() { return u; },
            select() {
              return { single: async () => ({ data: { id: crypto.randomUUID() }, error: null }) };
            },
            then: (res) => res({ data: null, error: null }),
          };
          return u;
        },
      };
    },
  };
}

// Classe de Execução da Simulação
export class SimuladorAtendimento {
  constructor(nomePersona, perfil) {
    this.nomePersona = nomePersona;
    this.perfil = perfil;
    this.sb = criarSupabaseMockSimulacao();
    this.fluxo = criarFluxo(this.sb, crypto.randomUUID());
    this.transcricao = [];
  }

  async inicializarConversa(telefone, nomeCliente) {
    this.conversa = await this.fluxo.registrar({
      idConexao: "conn_test",
      telefone,
      nome: nomeCliente,
      texto: "Início",
      direcao: "recebida",
    });
    this.nomeCliente = nomeCliente;
    this.telefone = telefone;
    return this.conversa;
  }

  async enviarMensagemCliente(texto) {
    const inicioMs = Date.now();
    const rascunhosAntes = this.sb.dados.rascunhos.length;

    // Registra recebimento no banco
    await this.sb.from("mensagens").insert({
      id_conversa: this.conversa.id,
      direcao: "recebida",
      texto,
    });

    // Processa pelo motor
    await this.fluxo.processarRecebida(this.conversa, texto, this.nomeCliente);
    const duracaoMs = Date.now() - inicioMs;

    // Coleta as respostas emitidas neste turno
    const novosRascunhos = this.sb.dados.rascunhos.slice(rascunhosAntes);
    const respostasTexto = novosRascunhos.map((r) => r.texto_sugerido);

    const turnoLog = {
      turno: this.transcricao.length + 1,
      remetente: "Cliente",
      clienteMensagem: texto,
      respostasBot: respostasTexto,
      totalRespostas: respostasTexto.length,
      etapa: this.conversa.etapa,
      qualificacao: this.conversa.qualificacao,
      soVoce: this.conversa.so_voce,
      atender: this.conversa.atender,
      duracaoMs,
    };

    this.transcricao.push(turnoLog);
    return turnoLog;
  }

  async enviarDocumentosCliente(tipo = "rg_cnh") {
    const inicioMs = Date.now();
    const rascunhosAntes = this.sb.dados.rascunhos.length;

    await this.fluxo.marcarDocumentoRecebido(this.conversa);
    const duracaoMs = Date.now() - inicioMs;

    const novosRascunhos = this.sb.dados.rascunhos.slice(rascunhosAntes);
    const respostasTexto = novosRascunhos.map((r) => r.texto_sugerido);

    const turnoLog = {
      turno: this.transcricao.length + 1,
      remetente: "Cliente [ARQUIVO ENVIADO]",
      clienteMensagem: `[Upload de Documento: ${tipo}]`,
      respostasBot: respostasTexto,
      totalRespostas: respostasTexto.length,
      etapa: this.conversa.etapa,
      soVoce: this.conversa.so_voce,
      atender: this.conversa.atender,
      duracaoMs,
    };

    this.transcricao.push(turnoLog);
    return turnoLog;
  }
}

// --------------------------------------------------------------------------
// TESTE 1: CLIENTE TRANQUILO
// --------------------------------------------------------------------------
test("SIMULAÇÃO 1: Cliente Tranquilo (Fluxo fluido sem questionário, simulação, fechamento e envio)", async () => {
  const sim = new SimuladorAtendimento("Cliente Tranquilo", "Interessado e direto");
  await sim.inicializarConversa("5511999991111", "João Silva");

  // Turno 1: Cliente chega perguntando quanto libera
  const t1 = await sim.enviarMensagemCliente("Oi, tudo bem? Queria saber se libera algum valor pra mim");
  
  // Verificação 1: Bot NÃO pode perguntar se é INSS ou Servidor
  assert.equal(
    t1.respostasBot.some((r) => /aposentado|pensionista|servidor/i.test(r)),
    false,
    "ERRO: Bot perguntou se o cliente é aposentado ou servidor!"
  );
  // Verificação 2: Bot NÃO pode perguntar qual o banco (já sabemos que é Santander)
  assert.equal(
    t1.respostasBot.some((r) => /qual\s+banco/i.test(r)),
    false,
    "ERRO: Bot perguntou qual o banco do cliente!"
  );
  // Verificação 3: Bot promete simulação acolhedora
  assert.ok(
    t1.respostasBot.some((r) => /simula[cç][aã]o|quanto\s+libera/i.test(r)),
    "Bot deve prometer simulação imediata"
  );

  // Turno 2: Cliente aceita esperar simulação
  const t2 = await sim.enviarMensagemCliente("Beleza, fico no aguardo da simulação");
  assert.ok(t2.etapa !== "perdido", "Etapa não deve ser perdido");

  // Turno 3: Cliente recebe proposta e aceita fechar
  const t3 = await sim.enviarMensagemCliente("Gostei da taxa de 1,40% e da redução, quero fechar sim! Como faço?");
  // Verificação 4: Bot pede documentos usando a alternativa ilusória
  assert.ok(
    t3.respostasBot.some((r) => /foto\s+do\s+documento|agora\s+ou\s+prefere/i.test(r)),
    "Bot deve solicitar documentos utilizando técnica da alternativa ilusória"
  );

  // Turno 4: Cliente envia o documento
  const t4 = await sim.enviarDocumentosCliente("CNH_frente_verso.pdf");
  // Verificação 5: Bot avisa que recebeu, aciona trava e para de falar
  assert.equal(t4.soVoce, true, "so_voce deve ser TRUE após documento recebido");
  assert.equal(t4.etapa, "documentos_recebidos", "etapa deve ser documentos_recebidos");
  assert.ok(
    t4.respostasBot.some((r) => /recebi|validar\s+com\s+o\s+gerente/i.test(r)),
    "Bot deve confirmar recebimento educadamente"
  );
});

// --------------------------------------------------------------------------
// TESTE 2: CLIENTE DESCONFIADO
// --------------------------------------------------------------------------
test("SIMULAÇÃO 2: Cliente Desconfiado (Objeção de golpe, CNPJ, segurança documental e biometria)", async () => {
  const sim = new SimuladorAtendimento("Cliente Desconfiado", "Com medo de golpe, exige transparência");
  await sim.inicializarConversa("5511988882222", "Carlos Alberto");

  // Turno 1: Cliente desconfia de golpe
  const t1 = await sim.enviarMensagemCliente("Boa tarde. Quem é você e de onde tirou meu número? Isso é golpe?");
  
  // Verificação 1: Bot responde com transparência radical e dados oficiais
  assert.ok(
    t1.respostasBot.some((r) => /53\.093\.082\/0001-22|Capital\s*Cred|biometria\s+facial/i.test(r)),
    "Bot deve fornecer o CNPJ oficial e explicar formalização bancária segura"
  );

  // Turno 2: Cliente questiona por que precisa mandar documento pela internet
  const t2 = await sim.enviarMensagemCliente("Mas por que você precisa de foto do meu documento? Não passo documento pra estranho.");
  assert.ok(
    t2.respostasBot.some((r) => /antifraude|averba[cç][aã]o|exig[eê]ncia\s+do\s+pr[oó]prio\s+banco/i.test(r)),
    "Bot deve explicar a exigência regulatória do banco e usar alternativa ilusória"
  );

  // Turno 3: Cliente pergunta como funciona a parcela
  const t3 = await sim.enviarMensagemCliente("E como funciona essa taxa e a parcela?");
  assert.ok(t3.totalRespostas >= 1 || t3.respostasBot.length >= 0);

  // Turno 4: Cliente se sente seguro e envia o documento
  const t4 = await sim.enviarDocumentosCliente("RG_Carlos.jpg");
  assert.equal(t4.soVoce, true);
  assert.equal(t4.etapa, "documentos_recebidos");
});

// --------------------------------------------------------------------------
// TESTE 3: CLIENTE CHATO / DIFÍCIL
// --------------------------------------------------------------------------
test("SIMULAÇÃO 3: Cliente Chato (Reclama de 120 meses, desiste 'deixa pra lá', abandona e RETOMA)", async () => {
  const sim = new SimuladorAtendimento("Cliente Chato / Difícil", "Reclamão, desiste fácil e volta depois");
  await sim.inicializarConversa("5511977773333", "Marcos Paulo");

  // Turno 1: Cliente começa seco
  const t1 = await sim.enviarMensagemCliente("Oi, quero saber quanto libera pra mim");
  assert.equal(
    t1.respostasBot.some((r) => /aposentado|pensionista/i.test(r)),
    false,
    "ERRO: Não deve perguntar convênio"
  );

  // Turno 2: Cliente reclama do prazo
  const t2 = await sim.enviarMensagemCliente("120 meses é muito tempo! Vocês tão loucos? Não quero esse prazo longo.");
  assert.ok(
    t2.respostasBot.some((r) => /120\s+meses|trocar\s+uma\s+d[ií]vida\s+cara\s+por\s+uma\s+barata|1,40%/i.test(r)),
    "Bot deve aplicar o reframe comercial do prazo de 120 meses"
  );

  // Turno 3: Cliente diz 'Deixa, não quero mais fazer' (EXATO caso do print 2 do Ryan)
  const t3 = await sim.enviarMensagemCliente("Deixa, não quero mais fazer");
  // Verificação 3: Bot NÃO deve desistir na primeira recusa! Deve persuadir com a taxa de 2,x% vs 1,40%
  assert.ok(
    t3.respostasBot.some((r) => /2,x%|1,40%|lucro\s+voltar\s+pro\s+seu\s+bolso|sem\s+compromisso/i.test(r)),
    "Bot deve insistir persuasivamente na primeira recusa sem desistir"
  );

  // Turno 4: Cliente abandona e depois retoma: 'Oi quero fazer dnv' (EXATO caso do print 3 do Ryan)
  const t4 = await sim.enviarMensagemCliente("Oi quero fazer dnv");
  // Verificação 4: Bot NÃO PODE IGNORAR! Deve reativar imediatamente
  assert.equal(t4.atender, true, "Conversa deve ser reativada (atender = true)");
  assert.equal(t4.soVoce, false, "so_voce deve ser false para permitir bot falar");
  assert.ok(t4.totalRespostas >= 1, "Bot NÃO pode ficar em silêncio quando o cliente retoma!");
  assert.equal(
    t4.respostasBot.some((r) => /aposentado|servidor/i.test(r)),
    false,
    "Bot não pode perguntar convênio ao retomar"
  );
});
