import { test } from "node:test";
import assert from "node:assert/strict";
import { criarSeguimento } from "../src/seguimento.js";

function criarSupabaseMock({ conversas = [], solicitacoes = [] } = {}) {
  conversas.forEach((c) => { if (!c.user_id) c.user_id = "u1"; });
  solicitacoes.forEach((s) => { if (!s.user_id) s.user_id = "u1"; });
  const estadoConversas = [...conversas];
  const estadoSolicitacoes = [...solicitacoes];
  const mensagensEnviadas = [];

  return {
    estadoConversas,
    estadoSolicitacoes,
    mensagensEnviadas,
    from(tabela) {
      if (tabela === "conversas") {
        return {
          select(campos) {
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
              lt(campo, valor) {
                filtros.push((c) => (c[campo] ?? 0) < valor);
                return qb;
              },
              in(campo, valores) {
                filtros.push((c) => valores.includes(c[campo]));
                return qb;
              },
              order() { return qb; },
              limit(n) {
                const filtradas = estadoConversas.filter((c) => filtros.every((f) => f(c)));
                return Promise.resolve({ data: filtradas.slice(0, n), error: null });
              },
              maybeSingle() {
                const c = estadoConversas.find((item) => filtros.every((f) => f(item)));
                return Promise.resolve({ data: c ?? null, error: null });
              },
              single() {
                const c = estadoConversas.find((item) => filtros.every((f) => f(item)));
                return Promise.resolve({ data: c ?? null, error: null });
              },
            };
            return qb;
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                const c = estadoConversas.find((item) => item[campo] === valor);
                if (c) Object.assign(c, mudancas);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (tabela === "solicitacoes_followup") {
        return {
          select(campos, opts = {}) {
            if (opts.head && opts.count === "exact") {
              const filtros = [];
              const qbCount = {
                eq(campo, valor) {
                  filtros.push((s) => s[campo] === valor);
                  return qbCount;
                },
                in(c2, v2) {
                  filtros.push((s) => v2.includes(s[c2]));
                  const count = estadoSolicitacoes.filter((s) => filtros.every((f) => f(s))).length;
                  return Promise.resolve({ count, error: null });
                },
              };
              return qbCount;
            }
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
              in(campo, valores) {
                filtros.push((s) => valores.includes(s[campo]));
                return qb;
              },
              order() { return qb; },
              limit(n) {
                const filtradas = estadoSolicitacoes.filter((s) => filtros.every((f) => f(s)));
                return Promise.resolve({ data: filtradas.slice(0, n), error: null });
              },
            };
            return qb;
          },
          insert(nova) {
            const row = { id: `sol_${Date.now()}_${Math.random()}`, criado_em: new Date().toISOString(), ...nova };
            estadoSolicitacoes.push(row);
            return Promise.resolve({ data: row, error: null });
          },
          update(mudancas) {
            return {
              eq(campo, valor) {
                const s = estadoSolicitacoes.find((item) => item[campo] === valor);
                if (s) Object.assign(s, mudancas);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (tabela === "mensagens") {
        return {
          insert(msg) {
            mensagensEnviadas.push(msg);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`tabela desconhecida: ${tabela}`);
    },
  };
}

function criarMaestroMock() {
  const enviosWhatsapp = [];
  return {
    enviosWhatsapp,
    clientePara(idConexao) {
      return {
        async sendMessage(destino, texto) {
          enviosWhatsapp.push({ idConexao, destino, texto });
          return { id: "msg_ok" };
        },
      };
    },
    qualquerCliente() {
      return this.clientePara("padrao");
    },
  };
}

const HORA = 60 * 60 * 1000;
const MEIO_DIA = new Date("2026-08-10T15:00:00");

test("varrerSugestoes cria solicitação pendente e NUNCA envia diretamente ao WhatsApp", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Valdecir Silva",
      telefone: "5511999990001",
      etapa: "aguardando_documentos",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 8 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const supabase = criarSupabaseMock({ conversas });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerSugestoes(MEIO_DIA);
  assert.equal(res.sugeridas, 1);

  // A solicitação de follow-up foi inserida com status 'pendente'
  assert.equal(supabase.estadoSolicitacoes.length, 1);
  const sol = supabase.estadoSolicitacoes[0];
  assert.equal(sol.id_conversa, "c1");
  assert.equal(sol.status, "pendente");
  assert.match(sol.mensagem_sugerida, /Valdecir/);
  assert.match(sol.motivo, /aguardando_documentos|documentos/i);

  // REGRA DE OURO: O WhatsApp NUNCA foi acionado autonomamente!
  assert.equal(maestro.enviosWhatsapp.length, 0);
});

test("varrerSugestoes não duplica solicitação se já existe uma pendente", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Valdecir Silva",
      telefone: "5511999990001",
      etapa: "aguardando_documentos",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 8 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      status: "pendente",
      mensagem_sugerida: "Oi Valdecir",
      tentativa: 1,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerSugestoes(MEIO_DIA);
  assert.equal(res.sugeridas, 0);
  assert.equal(supabase.estadoSolicitacoes.length, 1);
  assert.equal(maestro.enviosWhatsapp.length, 0);
});

test("varrerEnviosAprovados dispara via WhatsApp com texto editado/aprovado pelo consultor", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Maria Oliveira",
      telefone: "5511999990002",
      etapa: "conversando",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 10 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      id_conexao: "conn1",
      status: "aprovada",
      mensagem_sugerida: "Oi Maria, tudo bem?",
      mensagem_aprovada: "Oi dona Maria! Tudo bem? Passando para saber se ficou alguma dúvida sobre a portabilidade.",
      tentativa: 1,
      criado_em: new Date(MEIO_DIA.getTime() - 2 * HORA).toISOString(),
      enviado_em: null,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerEnviosAprovados(MEIO_DIA);
  assert.equal(res.enviados, 1);

  // Disparou pelo WhatsApp com a mensagem aprovada pelo consultor
  assert.equal(maestro.enviosWhatsapp.length, 1);
  assert.equal(
    maestro.enviosWhatsapp[0].texto,
    "Oi dona Maria! Tudo bem? Passando para saber se ficou alguma dúvida sobre a portabilidade."
  );

  // Status atualizado para 'enviada'
  assert.equal(solicitacoes[0].status, "enviada");
  assert.ok(solicitacoes[0].enviado_em);

  // Conversa atualizada
  assert.equal(conversas[0].followups_enviados, 1);
  assert.ok(conversas[0].ultimo_followup_em);

  // Mensagem gravada no banco
  assert.equal(supabase.mensagensEnviadas.length, 1);
  assert.equal(supabase.mensagensEnviadas[0].direcao, "enviada");
});

test("varrerEnviosAprovados cancela envio se o cliente já tiver respondido antes do disparo", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Maria Oliveira",
      telefone: "5511999990002",
      etapa: "conversando",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      // Cliente respondeu há 10 minutos!
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 10 * 60 * 1000).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      id_conexao: "conn1",
      status: "aprovada",
      mensagem_sugerida: "Oi Maria",
      tentativa: 1,
      // Solicitação foi criada há 2 horas (antes da última recebida do cliente)
      criado_em: new Date(MEIO_DIA.getTime() - 2 * HORA).toISOString(),
      enviado_em: null,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerEnviosAprovados(MEIO_DIA);
  assert.equal(res.enviados, 0);

  // Não enviou para o WhatsApp!
  assert.equal(maestro.enviosWhatsapp.length, 0);

  // Status foi cancelado
  assert.equal(solicitacoes[0].status, "cancelada");
  assert.match(solicitacoes[0].rejeicao_motivo, /respondeu/i);
});

test("varrerEnviosAprovados cancela envio se o atendimento humano estiver ativo na conversa", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Sebastião Dias",
      telefone: "5511999990003",
      etapa: "conversando",
      // Consultor está com o caso na Fila!
      estagio: "aguardando_voce",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 20 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      id_conexao: "conn1",
      status: "aprovada",
      mensagem_sugerida: "Oi Sebastião",
      tentativa: 1,
      criado_em: new Date(MEIO_DIA.getTime() - 2 * HORA).toISOString(),
      aprovado_em: new Date(MEIO_DIA.getTime() - 1 * HORA).toISOString(),
      enviado_em: null,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerEnviosAprovados(MEIO_DIA);
  assert.equal(res.enviados, 0);

  // Nenhuma mensagem enviada ao WhatsApp
  assert.equal(maestro.enviosWhatsapp.length, 0);
  assert.equal(solicitacoes[0].status, "cancelada");
  assert.match(solicitacoes[0].rejeicao_motivo, /atendimento manual/i);
});

test("varrerEnviosAprovados aborta se houver violação de integridade no hash criptográfico", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Lúcia Martins",
      telefone: "5511999990004",
      etapa: "conversando",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 15 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      id_conexao: "conn1",
      status: "aprovada",
      mensagem_aprovada: "Texto que foi adulterado no banco",
      // Hash esperado de outro texto ("Texto original")
      hash_aprovacao: "hash_invalido_que_nao_bate",
      tentativa: 1,
      criado_em: new Date(MEIO_DIA.getTime() - 2 * HORA).toISOString(),
      aprovado_em: new Date(MEIO_DIA.getTime() - 1 * HORA).toISOString(),
      enviado_em: null,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerEnviosAprovados(MEIO_DIA);
  assert.equal(res.enviados, 0);

  // Bloqueado pela barreira de integridade criptográfica!
  assert.equal(maestro.enviosWhatsapp.length, 0);
  assert.equal(solicitacoes[0].status, "rejeitada");
  assert.match(solicitacoes[0].rejeicao_motivo, /integridade/i);
});

test("varrerEnviosAprovados expira aprovação com mais de 24 horas", async () => {
  const conversas = [
    {
      id: "c1",
      nome: "Arnaldo Antunes",
      telefone: "5511999990005",
      etapa: "conversando",
      estagio: "aguardando_bot",
      atender: true,
      seguir: true,
      followups_enviados: 0,
      ultimo_followup_em: null,
      ultima_recebida_em: new Date(MEIO_DIA.getTime() - 48 * HORA).toISOString(),
      id_conexao: "conn1",
    },
  ];

  const solicitacoes = [
    {
      id: "s1",
      id_conversa: "c1",
      id_conexao: "conn1",
      status: "aprovada",
      mensagem_aprovada: "Oi Arnaldo",
      tentativa: 1,
      criado_em: new Date(MEIO_DIA.getTime() - 36 * HORA).toISOString(),
      // Aprovado há 28 horas (passou do limite de 24h)
      aprovado_em: new Date(MEIO_DIA.getTime() - 28 * HORA).toISOString(),
      enviado_em: null,
    },
  ];

  const supabase = criarSupabaseMock({ conversas, solicitacoes });
  const maestro = criarMaestroMock();
  const seguimento = criarSeguimento({ supabase, maestro, userId: "u1" });

  const res = await seguimento.varrerEnviosAprovados(MEIO_DIA);
  assert.equal(res.enviados, 0);

  // Não envia follow-up expirado
  assert.equal(maestro.enviosWhatsapp.length, 0);
  assert.equal(solicitacoes[0].status, "expirada");
  assert.match(solicitacoes[0].rejeicao_motivo, /expirou/i);
});
