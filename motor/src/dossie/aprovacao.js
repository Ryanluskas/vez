import crypto from "node:crypto";

/*
  ============================================================================
  MÓDULO DE APROVAÇÃO HUMANA OBRIGATÓRIA E INTEGRIDADE CRIPTOGRÁFICA
  Garante que NENHUM dossiê ou texto de pagamento seja enviado ao grupo
  do WhatsApp sem aprovação expressa e assinada de um operador humano autenticado.

  MELHORIAS ARQUITETURAIS:
  1. Assinatura HMAC-SHA256 com segredo de aplicação mantido FORA do banco.
     Mesmo com acesso de escrita ao PostgreSQL, um atacante não consegue forjar o hash.
  2. Proteção contra adulteração de anexos e dados bancários (documentosHash, dadosBancariosHash).
  3. Proteção contra Replay Attack e expiração temporal máxima de 24 horas.
  4. Comparação em tempo constante (crypto.timingSafeEqual) contra timing attacks.
  ============================================================================
*/

const SEGREDOS_PROIBIDOS = new Set([
  "vez_dossie_hmac_secret_master_key_2026",
  "changeme",
  "secret",
  "default",
  "exemplo",
  "123456",
  "test",
]);

/**
 * Obtém e valida o segredo HMAC-SHA256 configurado no ambiente.
 * Falha de forma segura (fail-closed) caso o segredo esteja ausente, fraco ou use valor de exemplo.
 */
export function obterSegredoHmac(segredoExplicito = null) {
  const candidato = String(segredoExplicito ?? process.env.DOSSIE_HMAC_SECRET ?? "").trim();
  if (!candidato || candidato.length < 32) {
    return null;
  }
  if (SEGREDOS_PROIBIDOS.has(candidato.toLowerCase())) {
    return null;
  }
  return candidato;
}

/**
 * Gera hash SHA-256 consolidado da lista de documentos anexados ao dossiê.
 */
export function calcularHashDocumentos(documentos = []) {
  if (!Array.isArray(documentos) || documentos.length === 0) return "sem_documentos";

  const normalizados = documentos
    .map((d) => ({
      tipo: String(d.tipo_documento || d.tipo || ""),
      nome: String(d.arquivo_nome || d.nome || ""),
      url: String(d.arquivo_url || d.url || d.arquivo_base64_ou_url || ""),
      checksum: String(d.checksum || d.hash || ""),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));

  return crypto.createHash("sha256").update(JSON.stringify(normalizados), "utf8").digest("hex");
}

/**
 * Gera hash SHA-256 dos dados bancários apurados.
 */
export function calcularHashDadosBancarios(dadosBancarios = {}) {
  if (!dadosBancarios || typeof dadosBancarios !== "object") return "sem_dados_bancarios";

  const normalizados = {
    chavePix: String(dadosBancarios.chavePix || dadosBancarios.chave_pix || "").trim(),
    banco: String(dadosBancarios.banco || "").trim(),
    agencia: String(dadosBancarios.agencia || "").trim(),
    conta: String(dadosBancarios.conta || "").trim(),
    titular: String(dadosBancarios.titular || dadosBancarios.nome || "").trim(),
  };

  return crypto.createHash("sha256").update(JSON.stringify(normalizados), "utf8").digest("hex");
}

/**
 * Gera a assinatura criptográfica autenticada (HMAC-SHA256) do dossiê aprovado.
 * Exige DOSSIE_HMAC_SECRET válido (>= 32 caracteres); bloqueia geração caso ausente.
 */
export function gerarHashAprovacao({
  idOperacao,
  codigoOperacao,
  idOrganizacao = "",
  versao = 1,
  textoPagamento,
  documentos = null,
  documentosHash = null,
  dadosBancarios = null,
  dadosBancariosHash = null,
  userId,
  timestamp = new Date().toISOString(),
  nonce = "",
  segredo = null,
}) {
  const chaveHmac = obterSegredoHmac(segredo);
  if (!chaveHmac) {
    throw new Error(
      "Segredo DOSSIE_HMAC_SECRET ausente ou inseguro (mínimo de 32 caracteres exclusivos obrigatório). Aprovação bloqueada."
    );
  }

  const docHash = documentosHash || (documentos ? calcularHashDocumentos(documentos) : "");
  const bankHash = dadosBancariosHash || (dadosBancarios ? calcularHashDadosBancarios(dadosBancarios) : "");

  const partes = [
    String(idOperacao || ""),
    String(codigoOperacao || ""),
    String(idOrganizacao || ""),
    String(versao || 1),
    String(textoPagamento || "").trim(),
    String(docHash || ""),
    String(bankHash || ""),
    String(userId || ""),
    String(timestamp || ""),
  ];

  if (nonce) {
    partes.push(String(nonce));
  }

  const payload = partes.join("|::|");

  return crypto.createHmac("sha256", chaveHmac).update(payload, "utf8").digest("hex");
}

/**
 * Valida a integridade da aprovação humana comparando a assinatura recebida
 * exclusivamente com o HMAC-SHA256 recalculado dos dados. Inclui verificação de expiração de 24h.
 * Não aceita fallback SHA-256 simples sem chave secreta.
 */
export function validarIntegridadeAprovacao({
  idOperacao,
  codigoOperacao,
  idOrganizacao = "",
  versao = 1,
  textoPagamento,
  documentos = null,
  documentosHash = null,
  dadosBancarios = null,
  dadosBancariosHash = null,
  userId,
  timestamp,
  nonce = "",
  hashEsperado,
  segredo = null,
}) {
  if (!hashEsperado || typeof hashEsperado !== "string") return false;

  const chaveHmac = obterSegredoHmac(segredo);
  if (!chaveHmac) {
    return false;
  }

  // 1. Verificação de expiração temporal (máximo 24h)
  if (!timestamp) return false;
  const dataAprovacao = new Date(timestamp).getTime();
  const agora = Date.now();
  if (!Number.isFinite(dataAprovacao)) {
    return false;
  }
  // Rejeita aprovação com mais de 24h ou no futuro além de 5 min de clock skew
  if (agora - dataAprovacao > 24 * 60 * 60 * 1000 + 5 * 60 * 1000 || dataAprovacao - agora > 5 * 60 * 1000) {
    return false;
  }

  // 2. Assinatura canônica exclusiva HMAC-SHA256
  try {
    const calculadoHmac = gerarHashAprovacao({
      idOperacao,
      codigoOperacao,
      idOrganizacao,
      versao,
      textoPagamento,
      documentos,
      documentosHash,
      dadosBancarios,
      dadosBancariosHash,
      userId,
      timestamp,
      nonce,
      segredo: chaveHmac,
    });

    const bufCalculado = Buffer.from(calculadoHmac, "hex");
    const bufEsperado = Buffer.from(hashEsperado, "hex");
    if (bufCalculado.length > 0 && bufCalculado.length === bufEsperado.length && crypto.timingSafeEqual(bufCalculado, bufEsperado)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Converte de forma controlada uma operação legada (sem HMAC válido ou sem hashes de anexo/banco)
 * para o estado que exige nova aprovação humana explícita, sem aprová-la automaticamente.
 */
export function migrarOperacaoLegadaParaReaprovacao(operacao = {}) {
  return {
    ...operacao,
    status: "conferido_pendente_aprovacao",
    hash_aprovacao: null,
    aprovado_por: null,
    aprovado_em: null,
    requer_reaprovacao: true,
    motivo_reaprovacao:
      "Assinatura legada ou incompleta invalidada pela política de segurança HMAC-SHA256; exige nova aprovação humana.",
  };
}

/**
 * Barreira de segurança mandatória antes de qualquer envio ao WhatsApp.
 */
export function autorizarEnvioAoGrupo({ operacao = {}, userId = null, segredo = null } = {}) {
  if (!operacao || typeof operacao !== "object") {
    return {
      autorizado: false,
      motivo: "Operação inválida ou ausente.",
    };
  }

  // 0. Proteção contra replay / reenvio de aprovação já consumida
  if (operacao.status === "encaminhado" || operacao.encaminhado_em || operacao.aprovacao_consumida_em) {
    return {
      autorizado: false,
      motivo: "Operação já foi encaminhada anteriormente (replay de aprovação bloqueado).",
    };
  }

  // 1. Status deve ser expressamente 'aprovado'
  if (operacao.status !== "aprovado") {
    return {
      autorizado: false,
      motivo: `Operação com status "${operacao.status}"; envio ao grupo proibido sem aprovação prévia.`,
    };
  }

  // 2. Isolamento multi-tenant quando userId do executor é informado
  const tenantOperacao = operacao.user_id || operacao.id_organizacao || null;
  if (userId && tenantOperacao && String(tenantOperacao) !== String(userId)) {
    return {
      autorizado: false,
      motivo: "Violação de isolamento multi-tenant: operação pertence a outra organização.",
    };
  }

  // 3. Deve ter operador humano aprovador registrado
  if (!operacao.aprovado_por) {
    return {
      autorizado: false,
      motivo: "Operação não possui aprovador humano registrado.",
    };
  }

  // 4. Deve possuir hash de integridade
  if (!operacao.hash_aprovacao) {
    return {
      autorizado: false,
      motivo: "Hash de aprovação ausente (risco de adulteração).",
    };
  }

  // 5. Deve possuir texto de pagamento não vazio
  if (!operacao.texto_pagamento || operacao.texto_pagamento.trim().length < 50) {
    return {
      autorizado: false,
      motivo: "Texto de pagamento ausente ou inválido.",
    };
  }

  // 6. Segredo HMAC deve estar configurado no ambiente
  if (!obterSegredoHmac(segredo)) {
    return {
      autorizado: false,
      motivo: "Segredo DOSSIE_HMAC_SECRET ausente ou inseguro no ambiente; envio bloqueado por segurança.",
    };
  }

  // 7. Validação rigorosa de integridade criptográfica (anti-tampering & expiração)
  const integridadeValida = validarIntegridadeAprovacao({
    idOperacao: operacao.id,
    codigoOperacao: operacao.codigo_operacao,
    idOrganizacao: operacao.user_id || operacao.id_organizacao || "",
    versao: operacao.versao || 1,
    textoPagamento: operacao.texto_pagamento,
    documentosHash: operacao.documentos_hash || null,
    dadosBancariosHash: operacao.dados_bancarios_hash || null,
    userId: operacao.aprovado_por,
    timestamp: operacao.aprovado_em,
    nonce: operacao.nonce_aprovacao || "",
    hashEsperado: operacao.hash_aprovacao,
    segredo,
  });

  if (!integridadeValida) {
    return {
      autorizado: false,
      motivo: "Violação de integridade criptográfica: os dados da operação foram adulterados após a aprovação humana, a assinatura é legada sem HMAC ou a aprovação expirou (>24h).",
    };
  }

  return {
    autorizado: true,
    motivo: "Aprovação humana e integridade criptográfica HMAC-SHA256 validadas com sucesso.",
  };
}
