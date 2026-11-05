import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gerarHashAprovacao,
  validarIntegridadeAprovacao,
  autorizarEnvioAoGrupo,
  calcularHashDocumentos,
  calcularHashDadosBancarios,
} from "../src/dossie/aprovacao.js";

test("Integridade Criptográfica: valida timingSafeEqual e detecta alteração de 1 caractere", () => {
  const agoraIso = new Date().toISOString();
  const params = {
    idOperacao: "op_uuid_999",
    codigoOperacao: "VEZ-2026-000999",
    textoPagamento: "TEXTO CORRENTISTA SANTANDER: Redução de 2,x% para 1,40%, liberação líquida de R$ 4.712,00 na conta.",
    userId: "user_ryan_123",
    timestamp: agoraIso,
  };

  const hashOriginal = gerarHashAprovacao(params);
  assert.equal(typeof hashOriginal, "string");
  assert.equal(hashOriginal.length, 64, "HMAC-SHA-256 deve ter 64 caracteres hex");

  // Validação idêntica passa
  const validaOriginal = validarIntegridadeAprovacao({
    ...params,
    hashEsperado: hashOriginal,
  });
  assert.equal(validaOriginal, true);

  // Adulteração no texto (altera 1 centavo)
  const textoAdulterado = params.textoPagamento.replace("4.712,00", "4.712,01");
  const validaAdulterado = validarIntegridadeAprovacao({
    ...params,
    textoPagamento: textoAdulterado,
    hashEsperado: hashOriginal,
  });
  assert.equal(validaAdulterado, false, "Texto adulterado em 1 centavo deve invalidar o hash");

  // Adulteração no operador aprovador
  const validaOperadorFalso = validarIntegridadeAprovacao({
    ...params,
    userId: "hacker_456",
    hashEsperado: hashOriginal,
  });
  assert.equal(validaOperadorFalso, false, "Operador adulterado deve invalidar o hash");
});

test("Integridade Criptográfica: autorizarEnvioAoGrupo bloqueia fraude pós-aprovação", () => {
  const ts = new Date().toISOString();
  const idOp = "op_sec_001";
  const codOp = "VEZ-2026-123456";
  const textoValido = "TEXTO CORRENTISTA SANTANDER com mais de cinquenta caracteres obrigatórios para aprovação.";
  const userId = "ryan_operador";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    textoPagamento: textoValido,
    userId,
    timestamp: ts,
  });

  const opLegitima = {
    id: idOp,
    codigo_operacao: codOp,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: textoValido,
  };

  const checagemLegitima = autorizarEnvioAoGrupo({ operacao: opLegitima });
  assert.equal(checagemLegitima.autorizado, true);

  // Tentativa de alterar o texto de pagamento diretamente no banco pós-aprovação
  const opFraudada = {
    ...opLegitima,
    texto_pagamento: "TEXTO ADULTERADO: Troca da conta de destino ou valor sem re-aprovação humana.",
  };
  const checagemFraudada = autorizarEnvioAoGrupo({ operacao: opFraudada });
  assert.equal(checagemFraudada.autorizado, false);
  assert.match(checagemFraudada.motivo, /adulterados|expirada|violação/i);
});

test("Integridade Criptográfica: proteção de documentos e dados bancários com HMAC", () => {
  const ts = new Date().toISOString();
  const docs = [
    { tipo_documento: "rg_frente", arquivo_nome: "rg.pdf", checksum: "hash_rg_123" },
    { tipo_documento: "contracheque", arquivo_nome: "cc.pdf", checksum: "hash_cc_456" },
  ];
  const dadosBancarios = {
    banco: "Santander",
    agencia: "0333",
    conta: "123456-7",
    chavePix: "11122233344",
  };

  const hashDocs = calcularHashDocumentos(docs);
  const hashBanco = calcularHashDadosBancarios(dadosBancarios);

  const hashCompleto = gerarHashAprovacao({
    idOperacao: "op_docs_001",
    codigoOperacao: "VEZ-2026-DOC001",
    idOrganizacao: "tenant_org_a",
    versao: 1,
    textoPagamento: "TEXTO COM DADOS BANCARIOS COMPLETOS: Mais de cinquenta caracteres para aprovação válida.",
    documentosHash: hashDocs,
    dadosBancariosHash: hashBanco,
    userId: "operador_chefe",
    timestamp: ts,
  });

  // Validação legítima
  const validaLegitima = validarIntegridadeAprovacao({
    idOperacao: "op_docs_001",
    codigoOperacao: "VEZ-2026-DOC001",
    idOrganizacao: "tenant_org_a",
    versao: 1,
    textoPagamento: "TEXTO COM DADOS BANCARIOS COMPLETOS: Mais de cinquenta caracteres para aprovação válida.",
    documentosHash: hashDocs,
    dadosBancariosHash: hashBanco,
    userId: "operador_chefe",
    timestamp: ts,
    hashEsperado: hashCompleto,
  });
  assert.equal(validaLegitima, true);

  // Fraude: troca de um dos arquivos do documento (PDF substituído por outro)
  const docsTrocados = [
    { tipo_documento: "rg_frente", arquivo_nome: "rg_adulterado.pdf", checksum: "hash_malicioso" },
    { tipo_documento: "contracheque", arquivo_nome: "cc.pdf", checksum: "hash_cc_456" },
  ];
  const hashDocsTrocados = calcularHashDocumentos(docsTrocados);
  const validaDocsTrocados = validarIntegridadeAprovacao({
    idOperacao: "op_docs_001",
    codigoOperacao: "VEZ-2026-DOC001",
    idOrganizacao: "tenant_org_a",
    versao: 1,
    textoPagamento: "TEXTO COM DADOS BANCARIOS COMPLETOS: Mais de cinquenta caracteres para aprovação válida.",
    documentosHash: hashDocsTrocados,
    dadosBancariosHash: hashBanco,
    userId: "operador_chefe",
    timestamp: ts,
    hashEsperado: hashCompleto,
  });
  assert.equal(validaDocsTrocados, false, "Documento alterado DEVE invalidar a aprovação");

  // Fraude: troca de tenant (tentativa de replay cross-tenant)
  const validaTenantInvasor = validarIntegridadeAprovacao({
    idOperacao: "op_docs_001",
    codigoOperacao: "VEZ-2026-DOC001",
    idOrganizacao: "tenant_org_b",
    versao: 1,
    textoPagamento: "TEXTO COM DADOS BANCARIOS COMPLETOS: Mais de cinquenta caracteres para aprovação válida.",
    documentosHash: hashDocs,
    dadosBancariosHash: hashBanco,
    userId: "operador_chefe",
    timestamp: ts,
    hashEsperado: hashCompleto,
  });
  assert.equal(validaTenantInvasor, false, "Assinatura vinculada a outro tenant deve ser rejeitada");
});

test("Integridade Criptográfica: rejeita aprovação expirada com mais de 24 horas", () => {
  // Timestamp de 25 horas atrás
  const timestamp25hAtras = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const idOp = "op_exp_001";
  const codOp = "VEZ-2026-EXP001";
  const txt = "TEXTO EXPIRADO: Mais de cinquenta caracteres para testar a validade da janela de 24h.";
  const userId = "operador_antigo";

  const hashExpirado = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    textoPagamento: txt,
    userId,
    timestamp: timestamp25hAtras,
  });

  const valida = validarIntegridadeAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    textoPagamento: txt,
    userId,
    timestamp: timestamp25hAtras,
    hashEsperado: hashExpirado,
  });

  assert.equal(valida, false, "Aprovação com mais de 24 horas DEVE ser rejeitada como expirada");
});
