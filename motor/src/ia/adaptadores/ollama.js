import { ProvedorIA } from "../base.js";

/*
  ============================================================================
  ADAPTADOR OLLAMA (Modelos Locais — Llama 3.2 3B / Llama 3.2 1B)
  ============================================================================
*/

export class OllamaAdaptador extends ProvedorIA {
  constructor({
    baseUrl = process.env.OLLAMA_URL || "http://localhost:11434",
    modeloPadrao = process.env.OLLAMA_MODELO || "llama3.2:3b",
  } = {}) {
    super({
      nome: "ollama",
      modeloPadrao,
      apiKey: "local",
      baseUrl,
    });
  }

  estaConfigurado() {
    return true; // Local, não exige chave
  }

  async estaOnline() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
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
  }) {
    const inicioMs = Date.now();
    const modeloFinal = modelo || this.modeloPadrao;

    try {
      const corpo = {
        model: modeloFinal,
        prompt,
        stream: false,
        keep_alive: "30m",
        options: { temperature: temperatura },
        ...(sistema ? { system: sistema } : {}),
        ...(json ? { format: "json" } : {}),
      };

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const textoGerado = jsonResposta?.response || "";

      let dadosJson = null;
      if (json && textoGerado) {
        try {
          dadosJson = JSON.parse(textoGerado);
        } catch {}
      }

      const tokensEntrada = jsonResposta?.prompt_eval_count || 0;
      const tokensSaida = jsonResposta?.eval_count || 0;

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

  async gerarTexto({ prompt, sistema, modelo, temperatura = 0.4, timeoutMs = 35_000 }) {
    return this._executarChamada({
      prompt,
      sistema,
      modelo,
      temperatura,
      json: false,
      timeoutMs,
    });
  }

  async gerarJson({ prompt, sistema, modelo, temperatura = 0.1, timeoutMs = 15_000 }) {
    return this._executarChamada({
      prompt,
      sistema,
      modelo,
      temperatura,
      json: true,
      timeoutMs,
    });
  }
}
