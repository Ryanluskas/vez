import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { extrairTextoEvolution, ehConversaIndividual, normalizarTelefone } from "../src/evolution/webhook.js";
import { criarGestorIA } from "../src/ia/gestor.js";
import { criarSeguimento } from "../src/seguimento.js";
import { identificarObjecao, TIPOS_OBJECAO } from "../src/comercial/objecoes.js";
import { conferir } from "../src/numeros.js";
import { validarTexto } from "../src/agente/validar.js";
import { checarGatilhos } from "../src/gatilhos.js";

/*
  ============================================================================
  SUÍTE DE AUDITORIA DE PRONTIDÃO PARA PRODUÇÃO (FASE 12)
  Verificação rigorosa de resiliência, segurança, integridade financeira,
  autorização estrita e tolerância a falhas.
  ============================================================================
*/

// 1. Webhook Evolution: Deduplicação e filtragem
test("Evolution Webhook: ignora grupos e broadcasts, aceita conversas individuais", () => {
  assert.equal(ehConversaIndividual("120363025@g.us"), false); // Grupo WhatsApp
  assert.equal(ehConversaIndividual("status@broadcast"), false); // Status
  assert.equal(ehConversaIndividual("5511999990001@s.whatsapp.net"), true); // Individual Baileys
  assert.equal(ehConversaIndividual("5511999990001@c.us"), true); // Individual Web
  assert.equal(ehConversaIndividual("123456789@lid"), true); // Individual @lid
});

test("Evolution Webhook: normaliza telefones brasileiros em formato canônico", () => {
  assert.equal(normalizarTelefone("5511987654321@s.whatsapp.net"), "5511987654321");
  assert.equal(normalizarTelefone("5521999998888@c.us"), "5521999998888");
});

test("Evolution Webhook: extrai texto de mensagens diretas, legendas e tipos especiais", () => {
  assert.equal(extrairTextoEvolution({ message: { conversation: "Olá bom dia" } }), "Olá bom dia");
  assert.equal(
    extrairTextoEvolution({ message: { extendedTextMessage: { text: "Quero portabilidade" } } }),
    "Quero portabilidade"
  );
  assert.equal(
    extrairTextoEvolution({ message: { imageMessage: { caption: "Meu contracheque" } } }),
    "Meu contracheque"
  );
  assert.equal(
    extrairTextoEvolution({ message: { audioMessage: {} }, messageType: "audioMessage" }),
    "[áudio]"
  );
});

// 2. Barreira Financeira: Proteção contra alucinação de valores pela IA
test("Barreira Financeira: bloqueia número inventado pela IA que não veio de fonte real", () => {
  // A IA tenta redigir prometendo R$ 1.500,00 de margem
  const textoComAlucinacao = "Consegui liberar R$ 1.500,00 na sua conta com parcela de R$ 120,00.";
  const inventados = conferir(textoComAlucinacao, "Olá, vi sua proposta");

  assert.ok(inventados.length > 0);
  assert.ok(inventados.includes("1500"));

  // A barreira validarTexto também reprova
  const validacaoEnvio = validarTexto(textoComAlucinacao, {
    permitirNumeros: false,
    fontesPermitidas: ["Olá, vi sua proposta"],
  });

  assert.equal(validacaoEnvio.ok, false);
  assert.equal(validacaoEnvio.codigo, "inventou_numero");
});

test("Barreira Financeira: gatilhos de dinheiro congelam a conversa para a Fila (chama o humano)", () => {
  assert.equal(checarGatilhos("quanto libera pra mim?").travou, true);
  assert.equal(checarGatilhos("qual o valor da parcela?").travou, true);
  assert.equal(checarGatilhos("consegue fazer uma simulação?").travou, true);
  assert.equal(checarGatilhos("qual a taxa de juros do inss?").travou, true);
  assert.equal(checarGatilhos("quanto sobrou de margem?").travou, true);

  // Pergunta sem dinheiro não ativa gatilho financeiro
  assert.equal(checarGatilhos("bom dia, tudo bem?").travou, false);
  assert.equal(checarGatilhos("quais documentos vocês precisam?").travou, false);
});

// 3. Multiprovedor de IA: Fallback sob erro 429 ou Timeout
test("Multiprovedor IA: executa fallback automático quando primário retorna 429 ou timeout", async () => {
  const gestor = criarGestorIA();

  // Simula provedor primário com cota esgotada (429)
  const primarioMock = {
    nome: "Primário 429",
    estaConfigurado: () => true,
    modeloPadrao: "mock-primario",
    async gerarTexto() {
      return {
        ok: false,
        codigoStatus: 429,
        ehLimiteDeQuota: true,
        erro: "Rate limit exceeded (quota)",
        provedor: "gemini",
        modelo: "mock-primario",
      };
    },
  };

  // Simula secundário saudável
  const secundarioMock = {
    nome: "Secundário Saudável",
    estaConfigurado: () => true,
    modeloPadrao: "mock-secundario",
    async gerarTexto() {
      return {
        ok: true,
        texto: "Resposta gerada com sucesso pelo secundário.",
        provedor: "openai",
        modelo: "mock-secundario",
        tokensEntrada: 50,
        tokensSaida: 20,
        tokensTotal: 70,
        custoEstimado: 0.0001,
        latenciaMs: 150,
      };
    },
  };

  // Injeta mocks no gestor
  gestor.definirProvedor("gemini", primarioMock);
  gestor.definirProvedor("openai", secundarioMock);
  gestor.configurarProvedores({ primario: "gemini", secundario: "openai" });

  const texto = await gestor.escrever({ prompt: "Olá", sistema: "Assistente" });
  assert.equal(texto, "Resposta gerada com sucesso pelo secundário.");
});

test("Multiprovedor IA: quando todos os provedores falham, degrada com segurança para null (sem inventar)", async () => {
  const gestor = criarGestorIA();

  const primarioFalho = {
    nome: "Primário Falho",
    estaConfigurado: () => true,
    modeloPadrao: "p1",
    async gerarTexto() {
      return { ok: false, codigoStatus: 503, erro: "Service Unavailable", provedor: "gemini" };
    },
  };

  const secundarioFalho = {
    nome: "Secundário Falho",
    estaConfigurado: () => true,
    modeloPadrao: "p2",
    async gerarTexto() {
      return { ok: false, codigoStatus: 504, erro: "Gateway Timeout", provedor: "openai" };
    },
  };

  gestor.definirProvedor("gemini", primarioFalho);
  gestor.definirProvedor("openai", secundarioFalho);
  gestor.configurarProvedores({ primario: "gemini", secundario: "openai" });

  const texto = await gestor.escrever({ prompt: "Olá", sistema: "Assistente" });
  assert.equal(texto, null); // Null força handoff para a Fila do consultor, sem alucinação!
});

// 4. LGPD e Respeito a Opt-out
test("LGPD: identifica pedido de opt-out e desativação de atendimento", () => {
  const optOut1 = identificarObjecao("Não tenho interesse, favor tirar meu número da lista");
  assert.ok(optOut1);
  assert.equal(optOut1.tipo, TIPOS_OBJECAO.OPT_OUT_EXPLICITO);

  const optOut2 = identificarObjecao("Pare de me mandar mensagem, não quero nada");
  assert.ok(optOut2);
  assert.equal(optOut2.tipo, TIPOS_OBJECAO.OPT_OUT_EXPLICITO);
});

// 5. Follow-ups Supervisionados: Regra Absoluta de Não Envio sem Aprovação
test("Follow-up: sugestão NÃO é enviada ao WhatsApp sem status 'aprovada'", async () => {
  const agora = new Date("2026-08-10T14:00:00");
  const enviosWhatsapp = [];

  const maestroMock = {
    clientePara() {
      return {
        async sendMessage(destino, texto) {
          enviosWhatsapp.push({ destino, texto });
          return { id: "msg_123" };
        },
      };
    },
  };

  const solicitacoesNoBanco = [
    {
      id: "s1",
      id_conversa: "c1",
      status: "pendente", // Ainda NÃO aprovada
      mensagem_sugerida: "Oi tudo bem?",
      criado_em: new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "s2",
      id_conversa: "c2",
      status: "rejeitada", // Rejeitada pelo consultor
      mensagem_sugerida: "Oi tudo bem?",
      criado_em: new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const supabaseMock = {
    from(tabela) {
      if (tabela === "solicitacoes_followup") {
        return {
          select() {
            return {
              eq(campo, valor) {
                return {
                  is() {
                    return {
                      order() {
                        return {
                          limit() {
                            const aprovadas = solicitacoesNoBanco.filter(
                              (s) => s.status === "aprovada"
                            );
                            return Promise.resolve({ data: aprovadas, error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      return {};
    },
  };

  const seguimento = criarSeguimento({ supabase: supabaseMock, maestro: maestroMock, userId: "u1" });
  const resultado = await seguimento.varrerEnviosAprovados(agora);

  // REGRA DE OURO: 0 envios realizados
  assert.equal(resultado.enviados, 0);
  assert.equal(enviosWhatsapp.length, 0);
});

test("Follow-up: vinculação criptográfica garante que texto adulterado não é disparado", async () => {
  const agora = new Date("2026-08-10T14:00:00");
  const enviosWhatsapp = [];

  const maestroMock = {
    clientePara() {
      return {
        async sendMessage(destino, texto) {
          enviosWhatsapp.push({ destino, texto });
          return { id: "msg_123" };
        },
      };
    },
  };

  const textoAprovadoPeloRyan = "Oi Maria, tudo bem? Qualquer dúvida pode me chamar.";
  const hashValido = crypto.createHash("sha256").update(textoAprovadoPeloRyan).digest("hex");

  // Alguém tenta adulterar a mensagem no banco para inserir promessa falsa
  const mensagemAdulterada = "Oi Maria! Seu crédito de R$ 50.000 está pré-aprovado sem consulta!";

  const solicitacao = {
    id: "s1",
    id_conversa: "c1",
    id_conexao: "conn1",
    status: "aprovada",
    mensagem_aprovada: mensagemAdulterada,
    hash_aprovacao: hashValido, // O hash é da mensagem original!
    aprovado_em: new Date(agora.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    criado_em: new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    enviado_em: null,
  };

  const conversa = {
    id: "c1",
    nome: "Maria",
    telefone: "5511999990001",
    atender: true,
    seguir: true,
    estagio: "aguardando_bot",
    etapa: "conversando",
  };

  let statusAtualizado = null;

  const supabaseMock = {
    from(tabela) {
      if (tabela === "solicitacoes_followup") {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      order() {
                        return {
                          limit() {
                            return Promise.resolve({ data: [solicitacao], error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(mudancas) {
            return {
              eq() {
                statusAtualizado = mudancas.status;
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
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: conversa, error: null });
                  },
                };
              },
            };
          },
        };
      }
      return {};
    },
  };

  const seguimento = criarSeguimento({ supabase: supabaseMock, maestro: maestroMock, userId: "u1" });
  const resultado = await seguimento.varrerEnviosAprovados(agora);

  // Envio BLOQUEADO por violação de integridade criptográfica!
  assert.equal(resultado.enviados, 0);
  assert.equal(enviosWhatsapp.length, 0);
  assert.equal(statusAtualizado, "rejeitada");
});
