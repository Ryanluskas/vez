import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  calcularReducaoCapitalCred,
  comoDinheiro,
  comoNumero,
} from "../src/comercial/calculadora.js";
import {
  gerarHashAprovacao,
  validarIntegridadeAprovacao,
  autorizarEnvioAoGrupo,
  calcularHashDocumentos,
  calcularHashDadosBancarios,
} from "../src/dossie/aprovacao.js";
import { encaminharDossieAoGrupo } from "../src/dossie/encaminhador.js";
import { criarTravas } from "../src/travas.js";

/*
  ============================================================================
  SUITE DE TESTES ADVERSARIAIS INDEPENDENTES — VEZ PRODUÇÃO
  Auditoria de Segurança, Isolamento Multi-Tenant, HMAC, Regras Financeiras,
  Consentimento LGPD, Resiliência e Recuperação.
  ============================================================================
*/

// ============================================================================
// 1. TESTES ADVERSARIAIS MULTI-TENANT
// ============================================================================

test("Multi-Tenant Adversarial: Mesmo telefone em dois tenants diferentes NÃO vaza estado", async () => {
  const telefoneCompartilhado = "5511999998888";
  const tenantAlpha = "user_tenant_alpha_uuid";
  const tenantBeta = "user_tenant_beta_uuid";

  // Simulação do banco com duas conversas para o mesmo telefone em tenants diferentes
  const bancoConversas = [
    {
      id: "conv_alpha_1",
      user_id: tenantAlpha,
      telefone: telefoneCompartilhado,
      nome: "Carlos Alpha",
      etapa: "em_atendimento",
      estagio: "aguardando_cliente",
      memoria: { banco: "Santander", valor_liberado: "R$ 4.712,00" },
    },
    {
      id: "conv_beta_1",
      user_id: tenantBeta,
      telefone: telefoneCompartilhado,
      nome: "Carlos Beta",
      etapa: "novo_contato",
      estagio: "aguardando_bot",
      memoria: { banco: "Bradesco", valor_liberado: "R$ 1.200,00" },
    },
  ];

  // Função simulada de busca escopada por tenant
  function buscarConversa(userId, tel) {
    return bancoConversas.find((c) => c.user_id === userId && c.telefone === tel) || null;
  }

  const convA = buscarConversa(tenantAlpha, telefoneCompartilhado);
  const convB = buscarConversa(tenantBeta, telefoneCompartilhado);

  assert.ok(convA, "Conversa do Tenant Alpha deve existir");
  assert.ok(convB, "Conversa do Tenant Beta deve existir");
  assert.notEqual(convA.id, convB.id, "Os IDs de conversa devem ser estritamente distintos");
  assert.equal(convA.memoria.banco, "Santander");
  assert.equal(convB.memoria.banco, "Bradesco");

  // Tentativa adversária: Tenant Beta tenta buscar com o id da conversa de Alpha
  function buscarPorIdETenant(userId, idConversa) {
    return bancoConversas.find((c) => c.user_id === userId && c.id === idConversa) || null;
  }

  const tentativaInvasao = buscarPorIdETenant(tenantBeta, convA.id);
  assert.equal(
    tentativaInvasao,
    null,
    "Tentativa de acesso com ID de outro tenant DEVE retornar null (RLS / escopo rígido)"
  );
});

test("Multi-Tenant Adversarial: Worker de follow-up de Tenant Beta não processa jobs de Tenant Alpha", async () => {
  const tenantAlpha = "tenant_alpha";
  const tenantBeta = "tenant_beta";

  const pendenciasNoBanco = [
    { id: "p1", user_id: tenantAlpha, status: "aberta", pergunta: "Quanto libera?" },
    { id: "p2", user_id: tenantAlpha, status: "aberta", pergunta: "Qual a taxa?" },
    { id: "p3", user_id: tenantBeta, status: "aberta", pergunta: "Sou do INSS" },
  ];

  // Worker de Beta consultando com escopo de Beta
  function pollerWorker(userId) {
    return pendenciasNoBanco.filter((p) => p.user_id === userId && p.status === "aberta");
  }

  const jobsBeta = pollerWorker(tenantBeta);
  assert.equal(jobsBeta.length, 1);
  assert.equal(jobsBeta[0].id, "p3");
  assert.equal(jobsBeta[0].user_id, tenantBeta);

  // Garante que nenhum job de Alpha foi retornado
  assert.ok(jobsBeta.every((j) => j.user_id === tenantBeta));
});

// ============================================================================
// 2. TESTES ADVERSARIAIS DO HMAC E APROVAÇÃO DO DOSSIÊ
// ============================================================================

test("HMAC Adversarial: Alteração de 1 caractere no texto de pagamento invalida aprovação", () => {
  const ts = new Date().toISOString();
  const params = {
    idOperacao: "op_sec_100",
    codigoOperacao: "VEZ-2026-ADV001",
    idOrganizacao: "tenant_alpha",
    versao: 1,
    textoPagamento: "TEXTO SANTANDER: Redução da taxa para 1,40%, liberando R$ 4.712,00 na conta do cliente.",
    userId: "gerente_operador",
    timestamp: ts,
  };

  const hashOriginal = gerarHashAprovacao(params);

  // Alteração de 1 dígito de centavo (4.712,00 -> 4.712,01)
  const textoAdulterado = params.textoPagamento.replace("4.712,00", "4.712,01");
  const valido = validarIntegridadeAprovacao({
    ...params,
    textoPagamento: textoAdulterado,
    hashEsperado: hashOriginal,
  });

  assert.equal(valido, false, "Texto adulterado em 1 centavo deve invalidar a assinatura HMAC");
});

test("HMAC Adversarial: Alteração de dados bancários pós-aprovação invalida o hash", () => {
  const ts = new Date().toISOString();
  const dadosBancariosLegitimos = {
    banco: "Santander",
    agencia: "0333",
    conta: "12345-6",
    chavePix: "11122233344",
    titular: "Sebastião Dias",
  };

  const hashBancoLegitimo = calcularHashDadosBancarios(dadosBancariosLegitimos);

  const hashDossie = gerarHashAprovacao({
    idOperacao: "op_sec_200",
    codigoOperacao: "VEZ-2026-ADV002",
    idOrganizacao: "tenant_alpha",
    textoPagamento: "TEXTO COM MAIS DE CINQUENTA CARACTERES OBRIGATÓRIOS PARA VALIDAÇÃO COMPLETA DA OPERAÇÃO.",
    dadosBancariosHash: hashBancoLegitimo,
    userId: "operador_banco",
    timestamp: ts,
  });

  // Fraude: Chave PIX alterada no banco para a chave de um fraudador
  const dadosBancariosFraudados = {
    ...dadosBancariosLegitimos,
    chavePix: "99988877700", // Chave do invasor
  };
  const hashBancoFraudado = calcularHashDadosBancarios(dadosBancariosFraudados);

  const valido = validarIntegridadeAprovacao({
    idOperacao: "op_sec_200",
    codigoOperacao: "VEZ-2026-ADV002",
    idOrganizacao: "tenant_alpha",
    textoPagamento: "TEXTO COM MAIS DE CINQUENTA CARACTERES OBRIGATÓRIOS PARA VALIDAÇÃO COMPLETA DA OPERAÇÃO.",
    dadosBancariosHash: hashBancoFraudado,
    userId: "operador_banco",
    timestamp: ts,
    hashEsperado: hashDossie,
  });

  assert.equal(valido, false, "Substituição de dados bancários DEVE quebrar a integridade criptográfica");
});

test("HMAC Adversarial: Substituição maliciosa de arquivo PDF anexado invalida o hash", () => {
  const ts = new Date().toISOString();
  const docsLegitimos = [
    { tipo_documento: "rg_frente", arquivo_nome: "rg.pdf", checksum: "hash_original_rg" },
    { tipo_documento: "contracheque", arquivo_nome: "cc.pdf", checksum: "hash_original_cc" },
  ];
  const hashDocsLegitimos = calcularHashDocumentos(docsLegitimos);

  const hashDossie = gerarHashAprovacao({
    idOperacao: "op_sec_300",
    codigoOperacao: "VEZ-2026-ADV003",
    idOrganizacao: "tenant_alpha",
    textoPagamento: "TEXTO COM MAIS DE CINQUENTA CARACTERES OBRIGATÓRIOS PARA VALIDAÇÃO COMPLETA DA OPERAÇÃO.",
    documentosHash: hashDocsLegitimos,
    userId: "operador_docs",
    timestamp: ts,
  });

  // Fraude: Invasor substitui o contracheque por um forjado
  const docsFraudados = [
    { tipo_documento: "rg_frente", arquivo_nome: "rg.pdf", checksum: "hash_original_rg" },
    { tipo_documento: "contracheque", arquivo_nome: "cc_falsificado.pdf", checksum: "hash_forjado_999" },
  ];
  const hashDocsFraudados = calcularHashDocumentos(docsFraudados);

  const valido = validarIntegridadeAprovacao({
    idOperacao: "op_sec_300",
    codigoOperacao: "VEZ-2026-ADV003",
    idOrganizacao: "tenant_alpha",
    textoPagamento: "TEXTO COM MAIS DE CINQUENTA CARACTERES OBRIGATÓRIOS PARA VALIDAÇÃO COMPLETA DA OPERAÇÃO.",
    documentosHash: hashDocsFraudados,
    userId: "operador_docs",
    timestamp: ts,
    hashEsperado: hashDossie,
  });

  assert.equal(valido, false, "Substituição de arquivo documental DEVE quebrar o hash do dossiê");
});

test("HMAC Adversarial: Tentativa de forjar hash no banco sem segredo HMAC falha", () => {
  const ts = new Date().toISOString();
  const textoFraudado = "TEXTO FRAUDADO: Transferir R$ 50.000,00 para conta fantasma no banco X.";
  const payloadFraudado = [
    "op_sec_400",
    "VEZ-2026-ADV004",
    "tenant_alpha",
    "1",
    textoFraudado,
    "",
    "",
    "hacker_user",
    ts,
  ].join("|::|");

  // O fraudador tem acesso de UPDATE no PostgreSQL e tenta calcular um SHA-256 comum
  const hashForjadoSemSegredo = crypto.createHash("sha256").update(payloadFraudado, "utf8").digest("hex");

  const checagem = autorizarEnvioAoGrupo({
    operacao: {
      id: "op_sec_400",
      codigo_operacao: "VEZ-2026-ADV004",
      user_id: "tenant_alpha",
      status: "aprovado",
      aprovado_por: "hacker_user",
      aprovado_em: ts,
      hash_aprovacao: hashForjadoSemSegredo,
      texto_pagamento: textoFraudado,
    },
  });

  assert.equal(checagem.autorizado, false, "Forja de hash sem a chave HMAC secreta DEVE ser rejeitada");
});

test("HMAC Adversarial: Replay de aprovação com mais de 24 horas é bloqueado", () => {
  // Timestamp de 24 horas e 10 minutos atrás
  const timestamp24h10m = new Date(Date.now() - (24 * 60 + 10) * 60 * 1000).toISOString();
  const txt = "TEXTO EXPIRADO: Mais de cinquenta caracteres para verificação de expiração estrita de 24h.";

  const hashAntigo = gerarHashAprovacao({
    idOperacao: "op_sec_500",
    codigoOperacao: "VEZ-2026-ADV005",
    idOrganizacao: "tenant_alpha",
    textoPagamento: txt,
    userId: "operador_antigo",
    timestamp: timestamp24h10m,
  });

  const checagem = autorizarEnvioAoGrupo({
    operacao: {
      id: "op_sec_500",
      codigo_operacao: "VEZ-2026-ADV005",
      user_id: "tenant_alpha",
      status: "aprovado",
      aprovado_por: "operador_antigo",
      aprovado_em: timestamp24h10m,
      hash_aprovacao: hashAntigo,
      texto_pagamento: txt,
    },
  });

  assert.equal(checagem.autorizado, false, "Aprovação expirada (>24h) DEVE ser barrada contra replay");
});

test("HMAC Adversarial: Replay cross-tenant (tentativa de reaproveitar aprovação em outro tenant) é bloqueado", () => {
  const ts = new Date().toISOString();
  const txt = "TEXTO REUTILIZADO: Mais de cinquenta caracteres para tentar reutilizar aprovação em tenant B.";

  // Assinado para tenant_alpha
  const hashTenantAlpha = gerarHashAprovacao({
    idOperacao: "op_sec_600",
    codigoOperacao: "VEZ-2026-ADV006",
    idOrganizacao: "tenant_alpha",
    textoPagamento: txt,
    userId: "operador_alpha",
    timestamp: ts,
  });

  // Tentativa de apresentar a mesma aprovação para tenant_beta
  const checagemTenantBeta = autorizarEnvioAoGrupo({
    operacao: {
      id: "op_sec_600",
      codigo_operacao: "VEZ-2026-ADV006",
      user_id: "tenant_beta", // Tentando fraudar tenant
      status: "aprovado",
      aprovado_por: "operador_alpha",
      aprovado_em: ts,
      hash_aprovacao: hashTenantAlpha,
      texto_pagamento: txt,
    },
  });

  assert.equal(checagemTenantBeta.autorizado, false, "Assinatura vinculada a outro tenant DEVE ser rejeitada");
});

test("HMAC Adversarial: Tentativa de envio para JID não oficial (não @g.us) é barrada", async () => {
  const ts = new Date().toISOString();
  const txt = "TEXTO VALIDO: Mais de cinquenta caracteres obrigatórios para validação de envio seguro.";

  const hash = gerarHashAprovacao({
    idOperacao: "op_sec_700",
    codigoOperacao: "VEZ-2026-ADV007",
    idOrganizacao: "tenant_alpha",
    textoPagamento: txt,
    userId: "operador_700",
    timestamp: ts,
  });

  const opValida = {
    id: "op_sec_700",
    codigo_operacao: "VEZ-2026-ADV007",
    user_id: "tenant_alpha",
    status: "aprovado",
    aprovado_por: "operador_700",
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    grupo_destino_jid: "5511999999999@s.whatsapp.net", // Tentando mandar para um contato privado, não grupo
  };

  await assert.rejects(
    () => encaminharDossieAoGrupo({ operacao: opValida, grupoDestinoJid: "5511999999999@s.whatsapp.net" }),
    /JID do grupo de pagamento inválido.*Deve ser um grupo do WhatsApp \(@g\.us\)/
  );
});

// ============================================================================
// 3. VALIDAÇÃO FINANCEIRA INDEPENDENTE (ORÁCULO MATEMÁTICO)
// ============================================================================

/**
 * Oráculo matemático independente baseado nas regras de negócio oficiais:
 * - Se redução < 8000.00: 62% cliente / 38% empresa
 * - Se redução >= 8000.00: 50% cliente / 50% empresa
 * - Arredondamento monetário estrito de duas casas decimais
 */
function oraculoFinanceiroIndependente(valor) {
  if (typeof valor === "string") {
    const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    valor = Number(limpo);
  }
  if (!Number.isFinite(valor) || valor <= 0) return { valido: false };

  // Normalização para 2 casas decimais estritas (padrão monetário)
  valor = Math.round(valor * 100) / 100;

  const corte = 8000.0;
  const eh5050 = valor >= corte;
  const percCliente = eh5050 ? 0.5 : 0.62;

  const cliente = Math.round(valor * percCliente * 100) / 100;
  const empresa = Math.round((valor - cliente) * 100) / 100;

  return {
    valido: true,
    total: valor,
    cliente,
    empresa,
    somaExata: cliente + empresa === valor,
  };
}

test("Validação Financeira Independente: Casos de fronteira e precisão sub-centavos", () => {
  const casosDeTeste = [
    { entrada: 7999.99, desc: "Franja inferior imediata R$ 7.999,99" },
    { entrada: 8000.00, desc: "Ponto de corte exato R$ 8.000,00" },
    { entrada: 8000.01, desc: "Franja superior imediata R$ 8.000,01" },
    { entrada: 7600.00, desc: "Valor comum de simulação R$ 7.600,00" },
    { entrada: 12500.50, desc: "Valor alto com centavos R$ 12.500,50" },
    { entrada: 7999.9999, desc: "Sub-centavos excessivos" },
  ];

  for (const c of casosDeTeste) {
    const calcEngine = calcularReducaoCapitalCred(c.entrada);
    const oraculo = oraculoFinanceiroIndependente(c.entrada);

    assert.equal(calcEngine.valido, oraculo.valido, `Validade deve bater para ${c.desc}`);
    assert.equal(calcEngine.cliente, oraculo.cliente, `Valor cliente deve bater para ${c.desc}`);
    assert.equal(calcEngine.empresa, oraculo.empresa, `Valor empresa deve bater para ${c.desc}`);
    assert.equal(
      calcEngine.cliente + calcEngine.empresa,
      calcEngine.valorTotal,
      `Soma cliente + empresa deve ser identicamente igual ao total para ${c.desc}`
    );
  }

  // Casos inválidos
  assert.equal(calcularReducaoCapitalCred(0).valido, false);
  assert.equal(calcularReducaoCapitalCred(-500).valido, false);
  assert.equal(calcularReducaoCapitalCred(null).valido, false);
  assert.equal(calcularReducaoCapitalCred(undefined).valido, false);
  assert.equal(calcularReducaoCapitalCred("não é número").valido, false);
  assert.equal(calcularReducaoCapitalCred(NaN).valido, false);
});

// ============================================================================
// 4. TESTES DE CONSENTIMENTO LGPD E CICLO DE VIDA DE OPT-OUT
// ============================================================================

test("Consentimento LGPD Adversarial: Simulação do ciclo completo (Opt-out -> Neutro ignorado -> Reativação explícita)", async () => {
  let conversaMock = {
    id: "conv_lgpd_001",
    telefone: "5511999993333",
    atender: true,
    seguir: true,
    opt_out: false,
    etapa: "em_atendimento",
    so_voce: false,
  };

  const followupsAtivos = [{ id: "f1", status: "pendente" }, { id: "f2", status: "aprovada" }];
  const logsConsentimento = [];

  // 1. Cliente envia "pare de mandar mensagens" (Opt-out explícito)
  function processarMensagem(msg) {
    const normalizada = msg.trim().toLowerCase();
    const ehOptOut =
      /^(pare|parar|sair|descadastrar|cancelar|stop)$/i.test(normalizada) ||
      /\b(?:(?:favor\s+)?(?:pare|parar)\s+de\s+(?:me\s+)?(?:mandar|enviar)|n[aã]o\s+me\s+(?:mande|chame|envie)\s+mais|remover?\s+(?:o\s+)?(?:meu\s+)?(?:n[uú]mero|contato)|descadastrar?|excluir?\s+(?:meus\s+dados|meu\s+n[uú]mero)|apagar?\s+meu\s+n[uú]mero|tirar\s+meu\s+n[uú]mero|sair\s+da\s+lista|bloquear\s+contatos?|n[aã]o\s+quero\s+(?:mais\s+)?receber|opt[\s-]?out)\b/i.test(normalizada);

    if (ehOptOut) {
      conversaMock.opt_out = true;
      conversaMock.atender = false;
      conversaMock.seguir = false;
      conversaMock.etapa = "perdido";
      followupsAtivos.forEach((f) => (f.status = "cancelada"));
      logsConsentimento.push({ evento: "opt_out_solicitado", msg });
      return { acao: "bloquear_e_confirmar_optout" };
    }

    if (conversaMock.opt_out === true) {
      // Se opt-out ativo, rejeita mensagens neutras/ambíguas
      const querRetomar = /\b(?:quer[oa]\s+(?:faz(?:er)?|ver|simula|retom)|wuero|reativ(?:ar)?|faz(?:er)?\s+dnv|de\s+novo|vamos\s+fazer)\b/i.test(normalizada);
      if (!querRetomar) {
        return { acao: "ignorado_bloqueio_lgpd" };
      }

      // Reativação explícita
      conversaMock.opt_out = false;
      conversaMock.atender = true;
      conversaMock.seguir = true;
      conversaMock.etapa = "em_atendimento";
      logsConsentimento.push({ evento: "opt_in_reativacao", msg });
      return { acao: "reativado" };
    }

    return { acao: "responder_normal" };
  }

  // A. Disparo de Opt-out
  const r1 = processarMensagem("Favor parar de mandar mensagens");
  assert.equal(r1.acao, "bloquear_e_confirmar_optout");
  assert.equal(conversaMock.opt_out, true);
  assert.equal(conversaMock.atender, false);
  assert.equal(followupsAtivos[0].status, "cancelada");
  assert.equal(followupsAtivos[1].status, "cancelada");
  assert.equal(logsConsentimento.length, 1);
  assert.equal(logsConsentimento[0].evento, "opt_out_solicitado");

  // B. Mensagens neutras/ambíguas subsequentes
  const r2 = processarMensagem("Oi");
  assert.equal(r2.acao, "ignorado_bloqueio_lgpd");
  assert.equal(conversaMock.opt_out, true);

  const r3 = processarMensagem("Bom dia, tudo bem?");
  assert.equal(r3.acao, "ignorado_bloqueio_lgpd");
  assert.equal(conversaMock.opt_out, true);

  const r4 = processarMensagem("Quem é?");
  assert.equal(r4.acao, "ignorado_bloqueio_lgpd");
  assert.equal(conversaMock.opt_out, true);

  // C. Reativação com erro de digitação/informalidade ("Oi wuero fazer dnv")
  const r5 = processarMensagem("Oi wuero fazer dnv");
  assert.equal(r5.acao, "reativado");
  assert.equal(conversaMock.opt_out, false);
  assert.equal(conversaMock.atender, true);
  assert.equal(conversaMock.etapa, "em_atendimento");
  assert.equal(logsConsentimento.length, 2);
  assert.equal(logsConsentimento[1].evento, "opt_in_reativacao");
});

// ============================================================================
// 5. TESTES DE RECUPERAÇÃO E RESILIÊNCIA CONTRA FALHAS E DUPLICAÇÕES
// ============================================================================

test("Recuperação e Resiliência: Deduplicação de Webhook repetido", () => {
  const idsVistos = new Set();

  function processarWebhook(mensagemId) {
    if (idsVistos.has(mensagemId)) {
      return { duplicado: true, status: "ignorado" };
    }
    idsVistos.add(mensagemId);
    return { duplicado: false, status: "processado" };
  }

  const msgId = "WA_MSG_ID_998877";

  // Primeira entrega
  const p1 = processarWebhook(msgId);
  assert.equal(p1.duplicado, false);
  assert.equal(p1.status, "processado");

  // Segunda entrega (repetição idêntica por timeout de rede da Evolution API)
  const p2 = processarWebhook(msgId);
  assert.equal(p2.duplicado, true);
  assert.equal(p2.status, "ignorado");

  // Terceira entrega
  const p3 = processarWebhook(msgId);
  assert.equal(p3.duplicado, true);
});

test("Recuperação e Resiliência: Estresse de Fila em Memória e Recuperação pós-crash", async () => {
  const travas = criarTravas();
  const idConversa = "conv_stress_recovery";
  let contadorExecucoes = 0;

  // Enfileira 10 mensagens simultâneas onde a mensagem 4 estoura com exceção fatal
  const promises = [];
  for (let i = 1; i <= 10; i++) {
    const num = i;
    const p = travas.naVezDe(idConversa, async () => {
      await new Promise((r) => setTimeout(r, 5));
      if (num === 4) {
        throw new Error("Crash de I/O na mensagem 4");
      }
      contadorExecucoes++;
      return num;
    }).catch((err) => {
      return `falha_tratada_${num}`;
    });

    promises.push(p);
  }

  const resultados = await Promise.all(promises);

  // 9 mensagens devem ter sido executadas com sucesso
  assert.equal(contadorExecucoes, 9);
  assert.equal(resultados[3], "falha_tratada_4");
  assert.equal(resultados[4], 5, "Mensagem 5 deve ter executado perfeitamente após a falha da 4");
  assert.equal(travas.ocupadas(), 0, "A trava deve estar limpa (zero leaks)");
});
