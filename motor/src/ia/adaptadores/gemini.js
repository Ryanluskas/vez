import { ProvedorIA } from "../base.js";

/*
  ============================================================================
  ADAPTADOR GOOGLE GEMINI (Gemini 2.5 Flash / Flash Lite / Pro)
  ============================================================================
*/

export class GeminiAdaptador extends ProvedorIA {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    modeloPadrao = process.env.GEMINI_MODELO || "gemini-3.5-flash-lite",
  } = {}) {
    super({
      nome: "gemini",
      modeloPadrao,
      apiKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
  }

  async estaOnline() {
    if (!this.apiKey) return false;
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
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
        erro: "Chave GEMINI_API_KEY não configurada.",
        status: 401,
        modelo: modeloFinal,
        inicioMs,
      });
    }

    try {
      // 1. Tenta a API padrão generateContent (compatível com mocks, testes e modelos legados)
      const urlClassic = `${this.baseUrl}/models/${modeloFinal}:generateContent?key=${this.apiKey}`;
      const corpoClassic = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: temperatura ?? (json ? 0.1 : 0.7),
          maxOutputTokens: maxTokens,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      };

      if (sistema) {
        corpoClassic.systemInstruction = {
          parts: [{ text: sistema }],
        };
      }

      let res = await fetch(urlClassic, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(corpoClassic),
      });

      let jsonResposta = null;
      let textoGerado = "";
      let tokensEntrada = 0;
      let tokensSaida = 0;

      // 2. Se a API clássica rejeitar novas chaves recomendando a Interactions API (HTTP 404 / Interactions)
      if (!res.ok) {
        const textoErro = await res.text().catch(() => "");
        const pedeInteractions =
          res.status === 404 &&
          (textoErro.includes("Interactions API") || textoErro.includes("no longer available to new users"));

        if (pedeInteractions) {
          const urlInteractions = `${this.baseUrl}/interactions`;
          const corpoInteractions = {
            model: modeloFinal,
            input: prompt,
          };

          if (sistema) {
            corpoInteractions.system_instruction = sistema;
          }

          if (temperatura !== undefined || maxTokens) {
            corpoInteractions.generation_config = {
              temperature: temperatura ?? (json ? 0.1 : 0.7),
              max_output_tokens: maxTokens || 800,
            };
          }

          const resInteractions = await fetch(urlInteractions, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify(corpoInteractions),
          });

          if (!resInteractions.ok) {
            const erroInt = await resInteractions.text().catch(() => "");
            return this.montarRespostaErro({
              erro: erroInt || `HTTP ${resInteractions.status}`,
              status: resInteractions.status,
              modelo: modeloFinal,
              inicioMs,
            });
          }

          jsonResposta = await resInteractions.json().catch(() => null);
          if (jsonResposta?.steps && Array.isArray(jsonResposta.steps)) {
            for (const step of jsonResposta.steps) {
              if (step?.type === "model_output" && Array.isArray(step?.content)) {
                for (const item of step.content) {
                  if (item?.text) textoGerado += item.text;
                }
              }
            }
          }
          tokensEntrada = jsonResposta?.usage?.total_input_tokens || 0;
          tokensSaida = jsonResposta?.usage?.total_output_tokens || 0;
        } else {
          return this.montarRespostaErro({
            erro: textoErro || `HTTP ${res.status}`,
            status: res.status,
            modelo: modeloFinal,
            inicioMs,
          });
        }
      } else {
        jsonResposta = await res.json().catch(() => null);
        const candidato = jsonResposta?.candidates?.[0];
        textoGerado = candidato?.content?.parts?.[0]?.text || "";
        tokensEntrada = jsonResposta?.usageMetadata?.promptTokenCount || 0;
        tokensSaida = jsonResposta?.usageMetadata?.candidatesTokenCount || 0;
      }

      let dadosJson = null;
      if (json && textoGerado) {
        try {
          const textoLimpo = textoGerado
            .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
            .replace(/```[\s\S]*$/, "")
            .trim();
          dadosJson = JSON.parse(textoLimpo);
        } catch {
          // Se falhou parse, tenta direto
          try {
            dadosJson = JSON.parse(textoGerado);
          } catch {}
        }
      }

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
