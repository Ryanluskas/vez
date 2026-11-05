import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { decidir, ACOES } from "../src/agente/decidir.js";
import {
  obterSegredoHmac,
  gerarHashAprovacao,
  validarIntegridadeAprovacao,
  autorizarEnvioAoGrupo,
} from "../src/dossie/aprovacao.js";
import { encaminharDossieAoGrupo } from "../src/dossie/encaminhador.js";
import { MAXIMO_POR_MENSAGEM, montarPedido } from "../src/requisitos.js";

/*
  ============================================================================
  BATERIA DE TESTES — REVISÃO FINAL DE ENGENHARIA, SEGURANÇA E ORDEM
  Valida exaustivamente os 6 pontos auditados:
  1. Precedência de pendências humanas sobre objeções e aceites comerciais
  2. Rejeição fail-closed de segredos de exemplo/placeholders no HMAC
  3. Isolamento multi-tenant estrito (fail-closed) na aprovação de dossiês
  4. Idempotência e prevenção de duplicidade de envio sob falha parcial
  5. Validação ativa dos retornos dos endpoints da Evolution API
  6. Garantia de 1 único pedido por mensagem (MAXIMO_POR_MENSAGEM = 1)
  ============================================================================
*/

const SEGREDO_VALIDO_TESTE = "chave_exclusiva_de_alta_entropia_32_bytes_para_testes_2026_segura";

// ---------------------------------------------------------------------------
// 1. PRECEDÊNCIA E ORDEM DE DECISÃO
// ---------------------------------------------------------------------------

test("Ordem de Decisão: Objeção comercial durante 'aguardando_voce' retorna AGUARDAR", () => {
  const d = decidir({
    conversa: { atender: true, estagio: "aguardando_voce" },
    memoria: { coletado: {}, perguntado: {} },
    objecao: { tipo: "vou_pensar", exigeHandoffHumano: false },
  });

  assert.equal(d.acao, ACOES.AGUARDAR);
  assert.equal(d.motivo, "já existe pergunta esperando você nesta conversa");
});

test("Ordem de Decisão: Aceite de fechamento durante 'aguardando_voce' retorna AGUARDAR", () => {
  const d = decidir({
    conversa: { atender: true, estagio: "aguardando_voce" },
    memoria: { coletado: {}, perguntado: {} },
    objecao: { tipo: "acordo_fechamento", exigeHandoffHumano: false },
  });

  assert.equal(d.acao, ACOES.AGUARDAR);
  assert.equal(d.motivo, "já existe pergunta esperando você nesta conversa");
});

test("Ordem de Decisão: Confirmação de documentos com temPendenciaAberta retorna AGUARDAR", () => {
  const d = decidir({
    conversa: { atender: true, estagio: "aguardando_bot", temPendenciaAberta: true },
    memoria: { coletado: {}, perguntado: {} },
    objecao: { tipo: "confirmacao_documentos", exigeHandoffHumano: false },
  });

  assert.equal(d.acao, ACOES.AGUARDAR);
  assert.equal(d.motivo, "já existe pergunta esperando você nesta conversa");
});

test("Ordem de Decisão: Reclamação grave ou ameaça durante 'aguardando_voce' escala para segurança", () => {
  const d = decidir({
    conversa: { atender: true, estagio: "aguardando_voce" },
    memoria: { coletado: {}, perguntado: {} },
    objecao: { tipo: "reclamacao_grave", exigeHandoffHumano: true },
  });

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(d.escalonamento, "seguranca");
  assert.equal(d.assumirManual, true);
});

// ---------------------------------------------------------------------------
// 2. SEGREDOS PROIBIDOS E ENTROPIA HMAC
// ---------------------------------------------------------------------------

test("Segurança HMAC: obterSegredoHmac rejeita segredos vazios ou curtos (<32 caracteres)", () => {
  assert.equal(obterSegredoHmac(null), null);
  assert.equal(obterSegredoHmac(""), null);
  assert.equal(obterSegredoHmac("curto_123"), null);
  assert.equal(obterSegredoHmac("1234567890123456789012345678901"), null); // 31 chars
});

test("Segurança HMAC: obterSegredoHmac rejeita placeholders e segredos copiados de exemplos", () => {
  const proibidos = [
    "vez_dossie_hmac_secret_master_key_2026",
    "vez_segredo_mestre_hmac_capitalcred_2026_super_seguro",
    "vez_evolution_api_key_capitalcred_2026",
    "vez_webhook_secret_capitalcred_2026",
    "evolution_secret_pass_2026",
    "substitua_por_segredo_hmac_exclusivo_minimo_32_chars",
    "substitua_por_chave_evolution_aleatoria_32_chars",
    "substitua_por_webhook_secret_aleatorio_32_chars",
    "substitua_por_senha_db_evolution_forte",
    "changeme_chave_com_mais_de_32_caracteres_de_tamanho_minimo",
    "exemplo_de_segredo_de_mais_de_32_caracteres_no_arquivo",
  ];

  for (const segredo of proibidos) {
    assert.equal(
      obterSegredoHmac(segredo),
      null,
      `Segredo proibido/placeholder não foi rejeitado: "${segredo}"`
    );
  }
});

test("Segurança HMAC: obterSegredoHmac aceita chave segura exclusiva com >= 32 caracteres", () => {
  const chave = obterSegredoHmac(SEGREDO_VALIDO_TESTE);
  assert.equal(chave, SEGREDO_VALIDO_TESTE);
});

// ---------------------------------------------------------------------------
// 3. ISOLAMENTO MULTI-TENANT E FAIL-CLOSED
// ---------------------------------------------------------------------------

test("Multi-Tenant Fail-Closed: autorizarEnvioAoGrupo bloqueia se userId do executor não for informado", () => {
  const op = {
    id: "op_mt_1",
    codigo_operacao: "VEZ-2026-MT001",
    user_id: "tenant_alpha",
    status: "aprovado",
    aprovado_por: "operador_1",
    aprovado_em: new Date().toISOString(),
    texto_pagamento: "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES OBRIGATORIOS.",
    hash_aprovacao: "dummy_hash",
  };

  const resultadoSemUserId = autorizarEnvioAoGrupo({ operacao: op, userId: null });
  assert.equal(resultadoSemUserId.autorizado, false);
  assert.match(resultadoSemUserId.motivo, /Violação de isolamento multi-tenant/i);

  const resultadoUndefined = autorizarEnvioAoGrupo({ operacao: op });
  assert.equal(resultadoUndefined.autorizado, false);
  assert.match(resultadoUndefined.motivo, /Violação de isolamento multi-tenant/i);
});

test("Multi-Tenant Fail-Closed: autorizarEnvioAoGrupo bloqueia se operacao não tiver tenant", () => {
  const opSemTenant = {
    id: "op_mt_2",
    codigo_operacao: "VEZ-2026-MT002",
    user_id: null,
    id_organizacao: null,
    status: "aprovado",
    aprovado_por: "operador_1",
    aprovado_em: new Date().toISOString(),
    texto_pagamento: "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES OBRIGATORIOS.",
    hash_aprovacao: "dummy_hash",
  };

  const res = autorizarEnvioAoGrupo({ operacao: opSemTenant, userId: "tenant_alpha" });
  assert.equal(res.autorizado, false);
  assert.match(res.motivo, /Violação de isolamento multi-tenant/i);
});

test("Multi-Tenant Fail-Closed: autorizarEnvioAoGrupo bloqueia cross-tenant (userId divergente)", () => {
  const op = {
    id: "op_mt_3",
    codigo_operacao: "VEZ-2026-MT003",
    user_id: "tenant_alpha",
    status: "aprovado",
    aprovado_por: "operador_1",
    aprovado_em: new Date().toISOString(),
    texto_pagamento: "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES OBRIGATORIOS.",
    hash_aprovacao: "dummy_hash",
  };

  const res = autorizarEnvioAoGrupo({ operacao: op, userId: "tenant_beta" });
  assert.equal(res.autorizado, false);
  assert.match(res.motivo, /Violação de isolamento multi-tenant/i);
});

// ---------------------------------------------------------------------------
// 4. IDEMPOTÊNCIA E RETENTATIVAS DE ENVIO PARCIAL
// ---------------------------------------------------------------------------

test("Idempotência de Envio: encaminharDossieAoGrupo não duplica texto se já foi enviado", async () => {
  const ts = new Date().toISOString();
  const idOp = "op_idemp_01";
  const codOp = "VEZ-2026-IDEM01";
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE DE IDEMPOTENCIA.";
  const userId = "tenant_alpha";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    idOrganizacao: userId,
    textoPagamento: txt,
    userId,
    timestamp: ts,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  const op = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    texto_pagamento_enviado: true, // Já enviado em execução anterior
  };

  let chamadasTexto = 0;
  const mockEvolution = {
    async enviarTexto() {
      chamadasTexto++;
      return { ok: true, keyId: "msg_123" };
    },
    async enviarMedia() {
      return { ok: true, keyId: "media_123" };
    },
  };

  process.env.DOSSIE_HMAC_SECRET = SEGREDO_VALIDO_TESTE;

  const res = await encaminharDossieAoGrupo({
    operacao: op,
    userId,
    grupoDestinoJid: "120363045678912345@g.us",
    instanciaEvolution: "instancia_teste",
    clienteEvolution: mockEvolution,
  });

  assert.equal(res.ok, true);
  assert.equal(chamadasTexto, 0, "Texto já enviado NÃO pode ser disparado novamente");
});

test("Idempotência de Envio: encaminharDossieAoGrupo persiste texto_pagamento_enviado imediatamente", async () => {
  const ts = new Date().toISOString();
  const idOp = "op_idemp_02";
  const codOp = "VEZ-2026-IDEM02";
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE DE PERSISTENCIA.";
  const userId = "tenant_alpha";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    idOrganizacao: userId,
    textoPagamento: txt,
    userId,
    timestamp: ts,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  const op = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    texto_pagamento_enviado: false,
  };

  const updatesBanco = [];
  const mockSupabase = {
    from(tabela) {
      return {
        update(dados) {
          updatesBanco.push({ tabela, dados });
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  const mockEvolution = {
    async enviarTexto() {
      return { ok: true };
    },
  };

  process.env.DOSSIE_HMAC_SECRET = SEGREDO_VALIDO_TESTE;

  const res = await encaminharDossieAoGrupo({
    operacao: op,
    userId,
    grupoDestinoJid: "120363045678912345@g.us",
    instanciaEvolution: "instancia_teste",
    clienteEvolution: mockEvolution,
    supabase: mockSupabase,
  });

  assert.equal(res.ok, true);
  // O primeiro update deve ter sido da flag texto_pagamento_enviado
  assert.ok(updatesBanco.length >= 2);
  assert.equal(updatesBanco[0].dados.texto_pagamento_enviado, true);
});

test("Envio Parcial: autorizarEnvioAoGrupo permite retentativa com status 'erro_envio_parcial'", () => {
  const ts = new Date().toISOString();
  const idOp = "op_parcial_01";
  const codOp = "VEZ-2026-PARC01";
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA RETENTATIVA PARCIAL.";
  const userId = "tenant_alpha";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    idOrganizacao: userId,
    textoPagamento: txt,
    userId,
    timestamp: ts,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  const opParcial = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "erro_envio_parcial",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    texto_pagamento_enviado: true,
  };

  const aut = autorizarEnvioAoGrupo({
    operacao: opParcial,
    userId,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  assert.equal(aut.autorizado, true, "Retentativa de erro_envio_parcial DEVE ser autorizada");
});

test("Anti-Replay: autorizarEnvioAoGrupo bloqueia reenvio de operação já 'encaminhado'", () => {
  const op = {
    id: "op_rep_01",
    codigo_operacao: "VEZ-2026-REP001",
    user_id: "tenant_alpha",
    status: "encaminhado",
    encaminhado_em: new Date().toISOString(),
    aprovado_por: "operador_1",
    aprovado_em: new Date().toISOString(),
    texto_pagamento: "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES OBRIGATORIOS.",
    hash_aprovacao: "hash",
  };

  const aut = autorizarEnvioAoGrupo({ operacao: op, userId: "tenant_alpha" });
  assert.equal(aut.autorizado, false);
  assert.match(aut.motivo, /replay/i);
});

// ---------------------------------------------------------------------------
// 5. VALIDAÇÃO DE RETORNO DO PROVEDOR EVOLUTION API
// ---------------------------------------------------------------------------

test("Validação Evolution: erro retornado no corpo de enviarTexto dispara exceção", async () => {
  const ts = new Date().toISOString();
  const idOp = "op_evo_01";
  const codOp = "VEZ-2026-EVO001";
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE DE ERRO DE TEXTO.";
  const userId = "tenant_alpha";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    idOrganizacao: userId,
    textoPagamento: txt,
    userId,
    timestamp: ts,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  const op = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    texto_pagamento_enviado: false,
  };

  const mockEvolutionFalha = {
    async enviarTexto() {
      return { ok: false, error: "Evolution API: WhatsApp instance disconnected (401)" };
    },
  };

  process.env.DOSSIE_HMAC_SECRET = SEGREDO_VALIDO_TESTE;

  await assert.rejects(
    () =>
      encaminharDossieAoGrupo({
        operacao: op,
        userId,
        grupoDestinoJid: "120363045678912345@g.us",
        instanciaEvolution: "instancia_teste",
        clienteEvolution: mockEvolutionFalha,
      }),
    /Falha no envio de texto do dossiê.*WhatsApp instance disconnected/
  );
});

test("Validação Evolution: erro retornado em enviarMedia resulta em erro_envio_parcial", async () => {
  const ts = new Date().toISOString();
  const idOp = "op_evo_02";
  const codOp = "VEZ-2026-EVO002";
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE DE ERRO DE MEDIA.";
  const userId = "tenant_alpha";

  const hash = gerarHashAprovacao({
    idOperacao: idOp,
    codigoOperacao: codOp,
    idOrganizacao: userId,
    textoPagamento: txt,
    userId,
    timestamp: ts,
    segredo: SEGREDO_VALIDO_TESTE,
  });

  const op = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
    texto_pagamento_enviado: true,
  };

  const documentos = [
    { id: "doc_1", arquivo_nome: "contrato.pdf", url: "https://exemplo.com/c.pdf" },
  ];

  const mockEvolutionFalhaMedia = {
    async enviarMedia() {
      return { ok: false, error: "Arquivo corrompido ou inacessível no bucket" };
    },
  };

  process.env.DOSSIE_HMAC_SECRET = SEGREDO_VALIDO_TESTE;

  const resultado = await encaminharDossieAoGrupo({
    operacao: op,
    documentos,
    userId,
    grupoDestinoJid: "120363045678912345@g.us",
    instanciaEvolution: "instancia_teste",
    clienteEvolution: mockEvolutionFalhaMedia,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.status, "erro_envio_parcial");
  assert.ok(resultado.falhas.some((f) => f.includes("Arquivo corrompido")));
});

// ---------------------------------------------------------------------------
// 6. GARANTIA DE 1 ÚNICO PEDIDO POR MENSAGEM (MAXIMO_POR_MENSAGEM = 1)
// ---------------------------------------------------------------------------

test("Requisitos: MAXIMO_POR_MENSAGEM é estritamente 1 (nunca faz interrogatório)", () => {
  assert.equal(MAXIMO_POR_MENSAGEM, 1);

  // Memória completamente vazia (faltam todos os documentos para fechar)
  const memoriaVazia = { coletado: {}, perguntado: {} };
  const pedido = montarPedido(memoriaVazia, { para: "fechar" });

  assert.ok(pedido);
  assert.equal(pedido.chaves.length, 1, "Deve pedir EXATAMENTE 1 requisito por turno");
});
