import { log } from "../log.js";

/*
  ============================================================================
  CLIENTE HTTP — EVOLUTION API v2

  Adaptador de comunicação REST com a Evolution API v2 desacoplada.
  Isola totalmente as chamadas de rede para a Evolution API.
  ============================================================================
*/

export function criarClienteEvolution({
  serverUrl = process.env.EVOLUTION_SERVER_URL || "http://localhost:8080",
  apiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || "vez_evolution_api_key_capitalcred_2026",
  timeoutMs = 5_000,
} = {}) {
  const urlLimpa = serverUrl.replace(/\/+$/, "");

  async function requisicao(caminho, { metodo = "GET", corpo = null, customHeaders = {} } = {}) {
    const headers = {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...customHeaders,
    };

    const config = {
      method: metodo,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };

    if (corpo) {
      config.body = JSON.stringify(corpo);
    }

    const res = await fetch(`${urlLimpa}${caminho}`, config);
    const contentType = res.headers.get("content-type") || "";

    let dados = null;
    if (contentType.includes("application/json")) {
      dados = await res.json().catch(() => null);
    } else {
      dados = await res.text().catch(() => null);
    }

    if (!res.ok) {
      const msgErro =
        typeof dados === "object" && dados?.response?.message
          ? Array.isArray(dados.response.message)
            ? dados.response.message.join(", ")
            : dados.response.message
          : typeof dados === "string"
            ? dados
            : `HTTP ${res.status}`;
      throw new Error(`[Evolution API] ${metodo} ${caminho} falhou (${res.status}): ${msgErro}`);
    }

    return dados;
  }

  return {
    async estaOnline() {
      try {
        const res = await fetch(`${urlLimpa}/`, {
          signal: AbortSignal.timeout(4000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    async criarInstancia({
      nomeInstancia,
      webhookUrl = null,
      webhookSecret = null,
    }) {
      const payload = {
        instanceName: nomeInstancia,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };

      if (webhookUrl) {
        payload.webhook = {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          headers: webhookSecret ? { "x-webhook-secret": webhookSecret } : {},
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
          ],
        };
      }

      log.info(`[Evolution] Criando instância "${nomeInstancia}"...`);
      return requisicao("/instance/create", {
        metodo: "POST",
        corpo: payload,
      });
    },

    async listarInstancias() {
      try {
        const res = await requisicao("/instance/fetchInstances", { metodo: "GET" });
        return Array.isArray(res) ? res : [];
      } catch (err) {
        log.erro(`[Evolution] Erro ao listar instâncias: ${err.message}`);
        return [];
      }
    },

    async obterConexao({ nomeInstancia }) {
      return requisicao(`/instance/connect/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "GET",
      });
    },

    async obterEstadoConexao({ nomeInstancia }) {
      try {
        const res = await requisicao(
          `/instance/connectionState/${encodeURIComponent(nomeInstancia)}`,
          { metodo: "GET" }
        );
        return res?.instance?.state ?? "close";
      } catch (err) {
        log.erro(`[Evolution] Erro ao obter estado de "${nomeInstancia}": ${err.message}`);
        return "close";
      }
    },

    async configurarWebhook({ nomeInstancia, webhookUrl, webhookSecret = null }) {
      return requisicao(`/webhook/set/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "POST",
        corpo: {
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: true,
            headers: webhookSecret ? { "x-webhook-secret": webhookSecret } : {},
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
            ],
          },
        },
      });
    },

    async enviarTexto({ nomeInstancia, numero, texto, quoted = null }) {
      if (!numero || !texto) {
        throw new Error("Número e texto são obrigatórios para envio.");
      }

      // Se for JID (@s.whatsapp.net, @lid, @g.us), preserva o identificador original.
      // Se vier do legado como @c.us, normaliza para @s.whatsapp.net exigido pelo Baileys/Evolution.
      // Se for apenas dígitos, normaliza limpando caracteres não-numéricos.
      let destinoFormatado = String(numero).trim();
      if (destinoFormatado.endsWith("@c.us")) {
        destinoFormatado = destinoFormatado.replace(/@c\.us$/, "@s.whatsapp.net");
      } else if (!destinoFormatado.includes("@")) {
        destinoFormatado = destinoFormatado.replace(/\D/g, "");
      }

      const payload = {
        number: destinoFormatado,
        text: texto,
        delay: 1200,
      };

      if (quoted && typeof quoted === "object") {
        payload.quoted = quoted;
      }

      const res = await requisicao(`/message/sendText/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "POST",
        corpo: payload,
      });

      const keyId = res?.key?.id || res?.keyId || null;
      return {
        ok: true,
        keyId,
        dados: res,
      };
    },

    async enviarMedia({ nomeInstancia, numero, mediaUrlOuBase64, mediatype = "document", caption = "" }) {
      const destinoFormatado = String(numero).includes("@")
        ? String(numero).trim()
        : String(numero).replace(/\D/g, "");

      return requisicao(`/message/sendMedia/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "POST",
        corpo: {
          number: destinoFormatado,
          media: mediaUrlOuBase64,
          mediatype,
          caption,
          delay: 1200,
        },
      });
    },

    async desconectar({ nomeInstancia }) {
      return requisicao(`/instance/logout/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "DELETE",
      }).catch((e) => {
        log.alerta(`[Evolution] Logout de "${nomeInstancia}": ${e.message}`);
      });
    },

    async deletarInstancia({ nomeInstancia }) {
      return requisicao(`/instance/delete/${encodeURIComponent(nomeInstancia)}`, {
        metodo: "DELETE",
      }).catch((e) => {
        log.alerta(`[Evolution] Delete de "${nomeInstancia}": ${e.message}`);
      });
    },
  };
}
