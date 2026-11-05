import { ProvedorIA } from "../base.js";

/*
  ============================================================================
  ADAPTADOR GROQ (Llama 3.3 70B Versatile / Llama 3.1 8B)
  ============================================================================
*/

export class GroqAdaptador extends ProvedorIA {
  constructor({
    apiKey = process.env.GROQ_API_KEY,
    modeloPadrao = process.env.GROQ_MODELO || "llama-3.3-70b-versatile",
  } = {}) {
    super({
      nome: "groq",
      modeloPadrao,
      apiKey,
      baseUrl: "https://api.groq.com/openai/v1",
    });
  }

  async estaOnline() {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      return res.ok;
    } catch {
      return false;
    }
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
        erro: "Chave GROQ_API_KEY não configurada.",
        status: 401,
        modelo: modeloFinal,
        inicioMs,
      });
    }

    try {
      const mensagens = [];
      if (sistema) {
        mensagens.push({ role: "system", content: sistema });
      }
      mensagens.push({ role: "user", content: prompt });

      const corpo = {
        model: modeloFinal,
        messages: mensagens,
        temperature: temperatura,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      };

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
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
      const textoGerado = jsonResposta?.choices?.[0]?.message?.content || "";

      let dadosJson = null;
      if (json && textoGerado) {
        try {
          dadosJson = JSON.parse(textoGerado);
        } catch {}
      }

      const tokensEntrada = jsonResposta?.usage?.prompt_tokens || 0;
      const tokensSaida = jsonResposta?.usage?.completion_tokens || 0;

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

  async gerarTexto({ prompt, sistema, modelo, temperatura = 0.4, timeoutMs = 8_000, maxTokens = 600 }) {
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

  async gerarJson({ prompt, sistema, modelo, temperatura = 0.1, timeoutMs = 8_000, maxTokens = 600 }) {
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
