import { autorizarEnvioAoGrupo } from "./aprovacao.js";
import { telefoneAutorizadoNoPiloto } from "../piloto.js";
import { log } from "../log.js";

/*
  ============================================================================
  ENCAMINHADOR DO DOSSIÊ DE PAGAMENTO — EVOLUTION API
  Dispara o texto aprovado e os documentos para o grupo de WhatsApp oficial
  e atualiza o cliente e o CRM.
  ============================================================================
*/

export async function encaminharDossieAoGrupo({
  operacao,
  documentos = [],
  clienteTelefone,
  instanciaEvolution = "vez_8a44922bbd",
  grupoDestinoJid = process.env.GRUPO_PAGAMENTO_JID || null,
  clienteEvolution,
  supabase,
} = {}) {
  // 1. Verificação de barreira estrita de aprovação humana
  const checagem = autorizarEnvioAoGrupo({ operacao });
  if (!checagem.autorizado) {
    log.erro(`[Dossiê ${operacao?.codigo_operacao}] Envio barrado: ${checagem.motivo}`);
    throw new Error(`Envio não autorizado: ${checagem.motivo}`);
  }

  const grupo = grupoDestinoJid || operacao.grupo_destino_jid;
  if (!grupo || !grupo.includes("@g.us")) {
    throw new Error(`JID do grupo de pagamento inválido: "${grupo}". Deve ser um grupo do WhatsApp (@g.us).`);
  }

  log.info(`[Dossiê ${operacao.codigo_operacao}] Encaminhando para o grupo ${grupo}...`);

  // 2. Dispara o texto de pagamento aprovado
  if (clienteEvolution?.enviarTexto) {
    await clienteEvolution.enviarTexto({
      instancia: instanciaEvolution,
      para: grupo,
      texto: operacao.texto_pagamento,
    });
  }

  // 3. Dispara cada mídia/documento anexado ao dossiê
  for (const doc of documentos) {
    if (doc.arquivo_base64_ou_url && clienteEvolution?.enviarMedia) {
      try {
        await clienteEvolution.enviarMedia({
          instancia: instanciaEvolution,
          para: grupo,
          urlOuBase64: doc.arquivo_base64_ou_url,
          mimetype: doc.mimetype || "application/pdf",
          nomeArquivo: doc.arquivo_nome || "documento.pdf",
          legenda: `Operação ${operacao.codigo_operacao} — ${doc.tipo_documento}`,
        });
      } catch (err) {
        log.erro(`[Dossiê] Falha ao enviar anexo "${doc.arquivo_nome}": ${err.message}`);
      }
    }
  }

  // 4. Atualiza o status do dossiê no banco para 'encaminhado'
  if (supabase) {
    await supabase
      .from("operacoes_pagamento")
      .update({
        status: "encaminhado",
        encaminhado_em: new Date().toISOString(),
        grupo_destino_jid: grupo,
      })
      .eq("id", operacao.id);

    // 5. Atualiza a conversa do cliente no CRM
    await supabase
      .from("conversas")
      .update({
        etapa: "contrato_encaminhado",
        estagio: "aguardando_gerente",
        so_voce: true,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", operacao.id_conversa);
  }

  // 6. Atualiza o cliente no WhatsApp com mensagem de status (se autorizado no piloto)
  if (clienteTelefone && clienteEvolution?.enviarTexto) {
    if (telefoneAutorizadoNoPiloto(clienteTelefone)) {
      const msgCliente = "Seu contrato e documentos já foram encaminhados para processamento e pagamento pelo banco! Em breve te passo a confirmação.";
      await clienteEvolution.enviarTexto({
        instancia: instanciaEvolution,
        para: clienteTelefone,
        texto: msgCliente,
      });
    } else {
      log.info(`[Piloto] Notificação de status para cliente ${clienteTelefone} omitida (fora da allowlist).`);
    }
  }

  log.destaque(`[Dossiê ${operacao.codigo_operacao}] ✅ Enviado ao grupo de pagamento com sucesso!`);
  return { ok: true, status: "encaminhado" };
}
