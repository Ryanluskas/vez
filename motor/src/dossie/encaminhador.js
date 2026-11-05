import { autorizarEnvioAoGrupo, calcularHashDocumentos } from "./aprovacao.js";
import { telefoneAutorizadoNoPiloto } from "../piloto.js";
import { log } from "../log.js";

/*
  ============================================================================
  ENCAMINHADOR DO DOSSIÊ DE PAGAMENTO — EVOLUTION API
  Dispara o texto aprovado e os documentos para o grupo de WhatsApp oficial
  e atualiza o cliente e o CRM com controle de idempotência, validação de
  retorno de envio da Evolution e recuperação consistente sob falha parcial.
  ============================================================================
*/

function verificarRespostaEnvio(res, tipo) {
  if (res && typeof res === "object") {
    if (
      res.ok === false ||
      res.error ||
      (typeof res.status === "number" && res.status >= 400) ||
      (typeof res.statusCode === "number" && res.statusCode >= 400)
    ) {
      const errDetalhe = res.error || res.message || res.statusText || JSON.stringify(res);
      throw new Error(`Falha no envio de ${tipo}: ${errDetalhe}`);
    }
  }
}

export async function encaminharDossieAoGrupo({
  operacao,
  documentos = [],
  clienteTelefone,
  instanciaEvolution = null,
  grupoDestinoJid = process.env.GRUPO_PAGAMENTO_JID || null,
  clienteEvolution,
  supabase,
  userId = null,
} = {}) {
  // 1. Validação de formato do JID do grupo de destino (@g.us obrigatório)
  const grupo = grupoDestinoJid || operacao?.grupo_destino_jid;
  if (!grupo || !grupo.includes("@g.us")) {
    throw new Error(`JID do grupo de pagamento inválido: "${grupo}". Deve ser um grupo do WhatsApp (@g.us).`);
  }

  // 2. Verificação de barreira estrita de aprovação humana, integridade HMAC e isolamento multi-tenant (fail-closed)
  const checagem = autorizarEnvioAoGrupo({ operacao, userId });
  if (!checagem.autorizado) {
    log.erro(`[Dossiê ${operacao?.codigo_operacao}] Envio barrado: ${checagem.motivo}`);
    throw new Error(`Envio não autorizado: ${checagem.motivo}`);
  }

  // 3. Validação de integridade dos anexos contra o hash aprovado (se registrado na aprovação)
  if (operacao.documentos_hash && operacao.documentos_hash !== "sem_documentos") {
    const hashAtual = calcularHashDocumentos(documentos);
    if (hashAtual !== operacao.documentos_hash) {
      const msg = "Violação de integridade documental: os anexos fornecidos para envio divergem dos documentos aprovados.";
      log.erro(`[Dossiê ${operacao?.codigo_operacao}] ${msg}`);
      throw new Error(`Envio não autorizado: ${msg}`);
    }
  }

  const instancia =
    instanciaEvolution ||
    operacao.instancia_evolution ||
    process.env.EVOLUTION_INSTANCIA ||
    null;

  if (clienteEvolution && !instancia) {
    throw new Error("Instância Evolution não configurada para o encaminhamento do dossiê.");
  }

  log.info(`[Dossiê ${operacao.codigo_operacao}] Encaminhando para o grupo ${grupo}...`);

  const documentosEnviados = new Set(
    Array.isArray(operacao.documentos_enviados) ? operacao.documentos_enviados : []
  );
  let textoPagamentoEnviado = Boolean(operacao.texto_pagamento_enviado);

  // 4. Dispara o texto de pagamento aprovado (evitando duplicidade em retentativa)
  if (clienteEvolution?.enviarTexto && !textoPagamentoEnviado) {
    const resTexto = await clienteEvolution.enviarTexto({
      nomeInstancia: instancia,
      instancia,
      numero: grupo,
      para: grupo,
      texto: operacao.texto_pagamento,
    });
    verificarRespostaEnvio(resTexto, "texto do dossiê");
    textoPagamentoEnviado = true;

    // Persistência imediata do texto enviado para garantir idempotência em caso de crash subsequente
    if (supabase) {
      await supabase
        .from("operacoes_pagamento")
        .update({
          texto_pagamento_enviado: true,
          grupo_destino_jid: grupo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", operacao.id);
    }
  }

  // 5. Dispara cada mídia/documento anexado ao dossiê com rastreamento incremental e idempotente
  const falhasAnexos = [];
  for (let idx = 0; idx < documentos.length; idx++) {
    const doc = documentos[idx];
    const chaveDoc = String(doc.id || doc.arquivo_nome || doc.tipo_documento || `doc_${idx}`);
    if (documentosEnviados.has(chaveDoc)) {
      continue;
    }

    const midia = doc.arquivo_base64_ou_url || doc.arquivo_url || doc.url;
    if (midia && clienteEvolution?.enviarMedia) {
      const legenda = `Operação ${operacao.codigo_operacao} — ${doc.tipo_documento || doc.tipo || "documento"}`;
      const nomeArquivo = doc.arquivo_nome || doc.nome || "documento.pdf";
      const mimetype = doc.mimetype || "application/pdf";
      try {
        const resMedia = await clienteEvolution.enviarMedia({
          nomeInstancia: instancia,
          instancia,
          numero: grupo,
          para: grupo,
          mediaUrlOuBase64: midia,
          urlOuBase64: midia,
          mediatype: mimetype.startsWith("image/") ? "image" : "document",
          mimetype,
          fileName: nomeArquivo,
          nomeArquivo,
          caption: legenda,
          legenda,
        });
        verificarRespostaEnvio(resMedia, `anexo "${nomeArquivo}"`);
        documentosEnviados.add(chaveDoc);

        // Persistência incremental dos anexos enviados
        if (supabase) {
          await supabase
            .from("operacoes_pagamento")
            .update({
              documentos_enviados: Array.from(documentosEnviados),
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", operacao.id);
        }
      } catch (err) {
        log.erro(`[Dossiê] Falha ao enviar anexo "${nomeArquivo}": ${err.message}`);
        falhasAnexos.push(`${nomeArquivo}: ${err.message}`);
      }
    }
  }

  const agora = new Date().toISOString();

  // 6. Se houve falha em qualquer anexo, NÃO marca como 'encaminhado'
  if (falhasAnexos.length > 0) {
    if (supabase) {
      await supabase
        .from("operacoes_pagamento")
        .update({
          status: "erro_envio_parcial",
          texto_pagamento_enviado: textoPagamentoEnviado,
          documentos_enviados: Array.from(documentosEnviados),
          erro_envio: falhasAnexos.join("; "),
          grupo_destino_jid: grupo,
          atualizado_em: agora,
        })
        .eq("id", operacao.id);
    }

    return {
      ok: false,
      status: "erro_envio_parcial",
      documentosEnviados: Array.from(documentosEnviados),
      falhas: falhasAnexos,
    };
  }

  // 7. Atualiza o status do dossiê no banco para 'encaminhado' e consome a aprovação
  if (supabase) {
    await supabase
      .from("operacoes_pagamento")
      .update({
        status: "encaminhado",
        encaminhado_em: agora,
        aprovacao_consumida_em: agora,
        texto_pagamento_enviado: textoPagamentoEnviado,
        documentos_enviados: Array.from(documentosEnviados),
        erro_envio: null,
        grupo_destino_jid: grupo,
        atualizado_em: agora,
      })
      .eq("id", operacao.id);

    // 8. Atualiza a conversa do cliente no CRM
    await supabase
      .from("conversas")
      .update({
        etapa: "contrato_encaminhado",
        estagio: "aguardando_gerente",
        so_voce: true,
        atualizado_em: agora,
      })
      .eq("id", operacao.id_conversa);
  }

  // 9. Atualiza o cliente no WhatsApp com mensagem de status (se autorizado no piloto)
  if (clienteTelefone && clienteEvolution?.enviarTexto) {
    if (telefoneAutorizadoNoPiloto(clienteTelefone)) {
      const msgCliente =
        "Seu contrato e documentos já foram encaminhados para processamento pelo banco. Assim que houver atualização, te aviso por aqui.";
      await clienteEvolution.enviarTexto({
        nomeInstancia: instancia,
        instancia,
        numero: clienteTelefone,
        para: clienteTelefone,
        texto: msgCliente,
      });
    } else {
      log.info(`[Piloto] Notificação de status para cliente ${clienteTelefone} omitida (fora da allowlist).`);
    }
  }

  log.destaque(`[Dossiê ${operacao.codigo_operacao}] ✅ Enviado ao grupo de pagamento com sucesso!`);
  return {
    ok: true,
    status: "encaminhado",
    documentosEnviados: Array.from(documentosEnviados),
  };
}
