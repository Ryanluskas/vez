import http from "node:http";
import { criarMemoriaDeEventos } from "../travas.js";
import { idsMensagensEnviadasPorVez } from "../escuta.js";
import { calcularReducaoCapitalCred } from "../lista.js";
import { log } from "../log.js";

/*
  ============================================================================
  WEBHOOK RECEIVER — EVOLUTION API v2

  Servidor HTTP nativo e resiliente para recepção de eventos da Evolution API.
  - Validação de segurança por token/secret
  - Deduplicação de eventos em janela de memória (idempotência)
  - Isolamento de mensagens de grupo, status e transmissões
  - Integração segura com o orquestrador determinístico Vez
  ============================================================================
*/

const RECADO_POR_TIPO = {
  imageMessage: "[imagem]",
  videoMessage: "[vídeo]",
  audioMessage: "[áudio]",
  documentMessage: "[documento]",
  stickerMessage: "[figurinha]",
  locationMessage: "[localização]",
  contactMessage: "[contato]",
};

export function extrairTextoEvolution(data) {
  if (!data?.message) return "";

  const msg = data.message;
  const textoDireto =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.videoMessage?.caption ||
    "";

  if (textoDireto.trim()) return textoDireto.trim();

  const tipo = data.messageType;
  return RECADO_POR_TIPO[tipo] || "";
}

export function ehDocumentoOuImagem(data) {
  const tipo = data?.messageType || "";
  const msg = data?.message || {};
  return (
    tipo === "imageMessage" ||
    tipo === "documentMessage" ||
    Boolean(msg.imageMessage) ||
    Boolean(msg.documentMessage)
  );
}

export function ehConversaIndividual(remoteJid) {
  const id = String(remoteJid || "");
  if (!id) return false;
  if (id.includes("@g.us") || id === "status@broadcast") return false;
  return id.endsWith("@s.whatsapp.net") || id.endsWith("@c.us") || id.endsWith("@lid");
}

export function normalizarTelefone(remoteJid, msgItem = null) {
  // Se for LID, tenta obter o número real a partir de senderPn ou participantPn
  if (String(remoteJid || "").endsWith("@lid") && msgItem) {
    const key = msgItem.key || {};
    const alternativo =
      key.senderPn ||
      key.participantPn ||
      key.participantAlt ||
      msgItem.senderPn ||
      msgItem.participantPn;
    if (alternativo && !String(alternativo).endsWith("@lid")) {
      return String(alternativo).replace(/@.*$/, "").replace(/\D/g, "");
    }
  }

  const id = String(remoteJid || "");
  return id.replace(/@.*$/, "").replace(/\D/g, "");
}

export function criarServidorWebhook({
  fluxo,
  supabase,
  porta = Number(process.env.VEZ_WEBHOOK_PORT) || 3333,
  webhookSecret = process.env.VEZ_WEBHOOK_SECRET || null,
  aoAtualizarEstado = () => {},
}) {
  const jaVi = criarMemoriaDeEventos();
  let servidor = null;

  async function processarEvento(corpo) {
    if (!corpo || typeof corpo !== "object") return;

    const evento = String(corpo.event || corpo.type || "").toLowerCase();
    const nomeInstancia = corpo.instance;
    const dados = corpo.data;

    if (!dados) return;

    /* ---- 1. QRCODE_UPDATED / qrcode.updated ---- */
    if (evento.includes("qrcode")) {
      const base64 = dados.qrcode?.base64 || dados.base64 || null;
      if (base64 && nomeInstancia) {
        log.info(`[Webhook] QR Code atualizado para a instância "${nomeInstancia}".`);
        await supabase
          .from("conexoes")
          .update({
            estado: "aguardando_qr",
            qr: base64,
            detalhe: "Leia o QR Code com seu WhatsApp para conectar.",
            visto_em: new Date().toISOString(),
          })
          .eq("evolution_instancia", nomeInstancia);
        aoAtualizarEstado(nomeInstancia, "aguardando_qr", base64);
      }
      return;
    }

    /* ---- 2. CONNECTION_UPDATE / connection.update ---- */
    if (evento.includes("connection")) {
      const estado = dados.state || (dados.statusReason === 200 ? "open" : "close");
      const estadoVez =
        estado === "open"
          ? "conectado"
          : estado === "connecting"
            ? "iniciando"
            : "desligado";

      log.info(`[Webhook] Conexão da instância "${nomeInstancia}": ${estadoVez} (${estado})`);

      if (nomeInstancia) {
        await supabase
          .from("conexoes")
          .update({
            estado: estadoVez,
            qr: estadoVez === "conectado" ? null : undefined,
            detalhe:
              estadoVez === "conectado"
                ? "Conectado via Evolution API."
                : "Desconectado da Evolution API.",
            visto_em: new Date().toISOString(),
          })
          .eq("evolution_instancia", nomeInstancia);
        aoAtualizarEstado(nomeInstancia, estadoVez, null);
      }
      return;
    }

    /* ---- 3. MESSAGES_UPDATE / messages.update (ACKs de Entrega e Leitura) ---- */
    if (evento.includes("messages.update") || evento.includes("message_update")) {
      const updates = Array.isArray(dados) ? dados : [dados];
      for (const item of updates) {
        const keyId = item?.keyId || item?.key?.id;
        const statusRaw = String(item?.status || item?.update?.status || "").toUpperCase();
        if (!keyId || !statusRaw) continue;

        let statusEntrega = "enviado";
        if (statusRaw.includes("DELIVERY") || statusRaw === "DELIVERED") {
          statusEntrega = "entregue";
        } else if (statusRaw.includes("READ")) {
          statusEntrega = "lido";
        } else if (statusRaw.includes("ERROR") || statusRaw.includes("FAIL")) {
          statusEntrega = "falha";
        }

        try {
          await supabase
            .from("mensagens")
            .update({ status_entrega: statusEntrega })
            .eq("id_mensagem_whatsapp", keyId);
        } catch {}
      }
      return;
    }

    /* ---- 4. MESSAGES_UPSERT / messages.upsert ---- */
    if (evento.includes("messages")) {
      const msgItems = Array.isArray(dados) ? dados : [dados];

      for (const msgItem of msgItems) {
        if (!msgItem?.key) continue;

        const { remoteJid, fromMe, id: idMensagem } = msgItem.key;
        if (!ehConversaIndividual(remoteJid)) continue;

        const corrId = idMensagem ? idMensagem.slice(-8) : `msg_${Date.now()}`;
        await log.comContexto({ correlationId: corrId }, async () => {
          // Deduplicação estrita de eventos da Evolution (idempotência)
          if (idMensagem && !jaVi.novo(idMensagem)) {
            log.info(`[Webhook] Evento repetido ${idMensagem}; ignorado.`);
            return;
          }

          const telefone = normalizarTelefone(remoteJid, msgItem);
          if (!telefone) return;

          const texto = extrairTextoEvolution(msgItem);
          const nomeBruto = msgItem.pushName || null;
          const nome =
            nomeBruto && !/^\+?[\d\s()-]+$/.test(nomeBruto) ? nomeBruto.trim() : null;

          // Localiza a conexão correspondente a esta instância
          const { data: conexao } = await supabase
            .from("conexoes")
            .select("id, apelido, ativa")
            .eq("evolution_instancia", nomeInstancia)
            .maybeSingle();

          const idConexao = conexao?.id || null;
          const apelido = conexao?.apelido || nomeInstancia || "WhatsApp";

          const timestampMsg = msgItem.messageTimestamp
            ? Number(msgItem.messageTimestamp) * 1000
            : Date.now();

          const conversa = await fluxo.registrar({
            idConexao,
            idChat: remoteJid,
            idMensagem: idMensagem || null,
            telefone,
            nome,
            texto: texto || (ehDocumentoOuImagem(msgItem) ? "[documento]" : "[mensagem]"),
            direcao: fromMe ? "enviada" : "recebida",
            timestamp: timestampMsg,
          });

          log.info(
            `[${apelido}] ${fromMe ? "→" : "←"} ${nome ?? telefone}: ${texto.slice(0, 50)}${
              texto.length > 50 ? "…" : ""
            }`
          );

          // Se já tratada anteriormente, não reprocessa
          if (conversa.jaVista) return;

          // Se enviada pelo próprio consultor no WhatsApp, assume o controle apenas em conversas já avançadas.
          // Se foi enviada pelo Vez (robô / rascunho aprovado) ou for início/prospecção, não toma controle da conversa.
          if (fromMe) {
            const ehEnvioDoVez =
              (idMensagem && idsMensagensEnviadasPorVez.has(idMensagem)) ||
              (conversa.ultima_mensagem && texto && conversa.ultima_mensagem.trim() === texto.trim());

            if (ehEnvioDoVez) {
              log.info(`[${apelido}] Mensagem disparada pelo próprio Vez (${idMensagem || "texto"}); mantendo autonomia.`);
              return;
            }

            // Se o consultor digitou uma simulação no WhatsApp (ex: "Libera 7600" ou "libera 8000"):
            // Calcula a redução determinística da CapitalCred e alimenta a memória sem silenciar o robô
            const matchSimulacao = (texto || "").match(/\b(?:libera|libera[cç][aã]o|valor)\s*[:=]?\s*(?:r\$)?\s*(\d+[\d.,]*)/i);
            if (matchSimulacao && fluxo?.memoria) {
              const calculo = calcularReducaoCapitalCred(matchSimulacao[1]);
              if (calculo && calculo.cliente > 0) {
                await fluxo.memoria.guardarSimulacao(conversa.id, {
                  valor: calculo.clienteFormatado,
                  taxa: "1,40%",
                  parcela: "sem aumento",
                  de: "consultor",
                });
                log.destaque(
                  `[${apelido}] 💰 Simulação informada pelo consultor: Total ${matchSimulacao[1]} -> Cliente ${calculo.clienteFormatado} (${calculo.regra}). Gravado na memória.`
                );

                // Se houver pendência aberta, encerra
                try {
                  await supabase
                    .from("pendencias")
                    .update({
                      status: "respondida",
                      resposta: calculo.clienteFormatado,
                      respondida_em: new Date().toISOString(),
                    })
                    .eq("id_conversa", conversa.id)
                    .eq("status", "aberta");
                } catch {}

                // Envia a proposta oficial estruturada ao cliente para não deixar apenas o número cru
                try {
                  const primeiroNomeCliente = conversa.nome ? conversa.nome.trim().split(/\s+/)[0] : "";
                  const saudacao = primeiroNomeCliente ? `${primeiroNomeCliente}, ` : "";
                  const propostaOficial = `${saudacao}rodei sua simulação aqui no sistema do Santander. Conseguimos liberar ${calculo.clienteFormatado} líquido na sua conta hoje, mantendo sua parcela exatamente igual sem subir um centavo! Ficou bom para você? Quer dar entrada?`;

                  await fluxo.abrirRascunho({
                    idConversa: conversa.id,
                    texto: propostaOficial,
                    categoria: "valor",
                    origem: "consultor",
                  });
                } catch {}

                // Não bloqueia em so_voce; deixa o funil seguir para o aceite e documentos
                return;
              }
            }

            // Se for início de contato, prospecção ou primeiro atendimento, o envio de abertura do consultor NÃO trava o bot
            const ehInicioOuProspeccao =
              conversa.etapa === "novo_contato" ||
              conversa.etapa === "primeiro_atendimento" ||
              conversa.etapa === "prospeccao" ||
              conversa.etapa === "novo" ||
              conversa.etapa === "perdido";

            if (!ehInicioOuProspeccao && !conversa.so_voce) {
              await supabase
                .from("conversas")
                .update({
                  so_voce: true,
                  estagio: "aguardando_cliente",
                  atualizado_em: new Date().toISOString(),
                })
                .eq("id", conversa.id);
              conversa.so_voce = true;
              log.info(`[${apelido}] 👤 Consultor interagiu manualmente no WhatsApp; controle assumido (so_voce: true).`);
            }
            return;
          }

          // Mensagem com documento/imagem do cliente
          if (ehDocumentoOuImagem(msgItem) && conversa.atender !== false) {
            await fluxo.marcarDocumentoRecebido(conversa);
            log.destaque(`[${apelido}] 📄 ${nome ?? telefone} enviou documento.`);
            return;
          }

          if (texto) {
            await fluxo.processarRecebida(conversa, texto, nome);
          }
        });
      }
    }
  }

  function iniciar() {
    servidor = http.createServer(async (req, res) => {
      // Endpoint de saúde
      if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", servico: "vez-webhook" }));
        return;
      }

      if (req.method !== "POST" || !req.url?.startsWith("/webhook")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ erro: "Rota não encontrada" }));
        return;
      }

      // Validação de segurança por token (webhook secret)
      if (webhookSecret) {
        const secretRecebido =
          req.headers["x-webhook-secret"] ||
          req.headers["apikey"] ||
          new URL(req.url, `http://${req.headers.host}`).searchParams.get("secret");

        if (secretRecebido !== webhookSecret) {
          log.alerta("[Webhook] Requisição rejeitada: secret inválido ou ausente.");
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ erro: "Não autorizado" }));
          return;
        }
      }

      let corpoBruto = "";
      req.on("data", (chunk) => {
        corpoBruto += chunk;
        if (corpoBruto.length > 5_000_000) {
          // Proteção contra payloads gigantescos
          req.destroy();
        }
      });

      req.on("end", async () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ recebido: true }));

        try {
          const json = JSON.parse(corpoBruto);
          await processarEvento(json);
        } catch (erro) {
          log.erro(`[Webhook] Erro ao processar payload: ${erro.message}`);
        }
      });
    });

    servidor.listen(porta, () => {
      log.info(`[Webhook] Servidor ativo ouvindo na porta ${porta}`);
    });

    return servidor;
  }

  return {
    iniciar,
    parar() {
      if (servidor) {
        servidor.close();
        servidor = null;
      }
    },
    processarEvento,
  };
}
