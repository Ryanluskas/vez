import { autorizarEnvioAoGrupo, calcularHashDocumentos } from "./aprovacao.js";
import { telefoneAutorizadoNoPiloto } from "../piloto.js";
import { log } from "../log.js";

/*
  ============================================================================
  ENCAMINHADOR DO DOSSIÊ DE PAGAMENTO — EVOLUTION API
  Dispara o texto aprovado e os documentos para o grupo de WhatsApp oficial
  e atualiza o cliente e o CRM com controle de idempotência e falha parcial.
  ============================================================================
*/

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
  // 1. Verificação de barreira estrita de aprovação humana e integridade HMAC
  const checagem = autorizarEnvioAoGrupo({ operacao, userId });
  if (!checagem.autorizado) {
    log.erro(`[Dossiê ${operacao?.codigo_operacao}] Envio barrado: ${checagem.motivo}`);
    throw new Error(`Envio não autorizado: ${checagem.motivo}`);
  }

  // 2. Validação de integridade dos anexos contra o hash aprovado (se registrado na aprovação)
  if (operacao.documentos_hash && operacao.documentos_hash !== "sem_documentos") {
    const hashAtual = calcularHashDocumentos(documentos);
    if (hashAtual !== operacao.documentos_hash) {
      const msg = "Violação de integridade documental: os anexos fornecidos para envio divergem dos documentos aprovados.";
      log.erro(`[Dossiê ${operacao?.codigo_operacao}] ${msg}`);
      throw new Error(`Envio não autorizado: ${msg}`);
    }
  }

  const grupo = grupoDestinoJid || operacao.grupo_destino_jid;
  if (!grupo || !grupo.includes("@g.us")) {
    throw new Error(`JID do grupo de pagamento inválido: "${grupo}". Deve ser um grupo do WhatsApp (@g.us).`);
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

  // 3. Dispara o texto de pagamento aprovado (evitando duplicidade em retentativa)
  if (clienteEvolution?.enviarTexto && !textoPagamentoEnviado) {
    await clienteEvolution.enviarTexto({
      nomeInstancia: instancia,
      instancia,
      numero: grupo,
      para: grupo,
      texto: operacao.texto_pagamento,
    });
    textoPagamentoEnviado = true;
  }

  // 4. Dispara cada mídia/documento anexado ao dossiê com rastreamento de falhas
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
        await clienteEvolution.enviarMedia({
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
        documentosEnviados.add(chaveDoc);
      } catch (err) {
        log.erro(`[Dossiê] Falha ao enviar anexo "${nomeArquivo}": ${err.message}`);
        falhasAnexos.push(`${nomeArquivo}: ${err.message}`);
      }
    }
  }

  const agora = new Date().toISOString();

  // 5. Se houve falha em qualquer anexo, NÃO marca como 'encaminhado'
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

  // 6. Atualiza o status do dossiê no banco para 'encaminhado' e consome a aprovação
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
      })
      .eq("id", operacao.id);

    // 7. Atualiza a conversa do cliente no CRM
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

  // 8. Atualiza o cliente no WhatsApp com mensagem de status (se autorizado no piloto)
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
