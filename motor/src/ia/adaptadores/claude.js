import { ProvedorIA } from "../base.js";

/*
  ============================================================================
  ADAPTADOR ANTHROPIC CLAUDE (Claude 3.5 Sonnet / Haiku)
  ============================================================================
*/

export class ClaudeAdaptador extends ProvedorIA {
  constructor({
    apiKey = process.env.ANTHROPIC_API_KEY,
    modeloPadrao = process.env.ANTHROPIC_MODELO || "claude-3-5-haiku-20241022",
  } = {}) {
    super({
      nome: "claude",
      modeloPadrao,
      apiKey,
      baseUrl: "https://api.anthropic.com/v1",
    });
  }

  async estaOnline() {
    return Boolean(this.apiKey);
  }

  async _executarChamada({
    prompt,
    sistema,
    modelo,
    temperatura,
    json = false,
    timeoutMs,
    maxTokens,
  }) {
    const inicioMs = Date.now();
    const modeloFinal = modelo || this.modeloPadrao;

    if (!this.apiKey) {
      return this.montarRespostaErro({
        erro: "Chave ANTHROPIC_API_KEY não configurada.",
        status: 401,
        modelo: modeloFinal,
        inicioMs,
      });
    }

    try {
      const promptFinal = json
        ? `${prompt}\n\nIMPORTANTE: Responda ESTRITAMENTE em formato JSON válido, sem blocos de código ou marcações markdown.`
        : prompt;

      const corpo = {
        model: modeloFinal,
        max_tokens: maxTokens,
        temperature: temperatura,
        messages: [{ role: "user", content: promptFinal }],
      };

      if (sistema) {
        corpo.system = sistema;
      }

      const res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(corpo),
      });

      if (!res.ok) {
        const textoErro = await res.text().catch(() => "");
        return this.montarRespostaErro({
          erro: textoErro || `HTTP ${res.status}`,
          status: res.status,
          modelo: modeloFinal,
          inicioMs,
        });
      }

      const jsonResposta = await res.json();
      const textoGerado = jsonResposta?.content?.[0]?.text || "";

      let dadosJson = null;
      if (json && textoGerado) {
        try {
          dadosJson = JSON.parse(textoGerado);
        } catch {
          // Extração limpa se vier com markdown
          const match = textoGerado.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              dadosJson = JSON.parse(match[0]);
            } catch {}
          }
        }
      }

      const tokensEntrada = jsonResposta?.usage?.input_tokens || 0;
      const tokensSaida = jsonResposta?.usage?.output_tokens || 0;

      return this.montarRespostaSucesso({
        texto: textoGerado,
        dadosJson,
        modelo: modeloFinal,
        tokensEntrada,
        tokensSaida,
        inicioMs,
      });
    } catch (err) {
      return this.montarRespostaErro({
        erro: err.message,
        status: err.name === "TimeoutError" ? 408 : 500,
        modelo: modeloFinal,
        inicioMs,
      });
    }
  }

  async gerarTexto({ prompt, sistema, modelo, temperatura = 0.4, timeoutMs = 15_000, maxTokens = 800 }) {
    return this._executarChamada({
      prompt,
      sistema,
      modelo,
      temperatura,
      json: false,
      timeoutMs,
      maxTokens,
    });
  }

  async gerarJson({ prompt, sistema, modelo, temperatura = 0.1, timeoutMs = 15_000, maxTokens = 800 }) {
    return this._executarChamada({
      prompt,
      sistema,
      modelo,
      temperatura,
      json: true,
      timeoutMs,
      maxTokens,
    });
  }
}
