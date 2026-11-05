import { calcularCustoEstimado } from "./custos.js";

/*
  ============================================================================
  INTERFACE BASE — PROVEDOR DE INTELIGÊNCIA ARTIFICIAL

  Contrato padrão que todo adaptador (Gemini, Claude, OpenAI, Groq, Ollama)
  deve implementar.
  ============================================================================
*/

export class ProvedorIA {
  constructor({ nome, modeloPadrao, apiKey = null, baseUrl = null }) {
    this.nome = nome;
    this.modeloPadrao = modeloPadrao;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  estaConfigurado() {
    return Boolean(this.apiKey);
  }

  async estaOnline() {
    throw new Error(`Método estaOnline() não implementado para ${this.nome}`);
  }

  async gerarTexto({
    prompt,
    sistema = null,
    modelo = null,
    temperatura = 0.7,
    timeoutMs = 15_000,
    maxTokens = 800,
  }) {
    throw new Error(`Método gerarTexto() não implementado para ${this.nome}`);
  }

  async gerarJson({
    prompt,
    sistema = null,
    modelo = null,
    temperatura = 0.1,
    timeoutMs = 15_000,
    maxTokens = 800,
  }) {
    throw new Error(`Método gerarJson() não implementado para ${this.nome}`);
  }

  montarRespostaSucesso({
    texto,
    dadosJson = null,
    modelo,
    tokensEntrada = 0,
    tokensSaida = 0,
    inicioMs,
  }) {
    const latenciaMs = Date.now() - inicioMs;
    const tokensTotal = tokensEntrada + tokensSaida;
    const custoEstimado = calcularCustoEstimado({
      modelo,
      tokensEntrada,
      tokensSaida,
    });

    return {
      ok: true,
      texto: (texto ?? "").trim(),
      dadosJson,
      tokensEntrada,
      tokensSaida,
      tokensTotal,
      latenciaMs,
      custoEstimado,
      modelo,
      provedor: this.nome,
    };
  }

  montarRespostaErro({ erro, status = 500, modelo, inicioMs }) {
    const latenciaMs = Date.now() - inicioMs;
    const ehLimiteDeQuota = status === 429 || /quota|rate limit|resource exhausted/i.test(erro);

    return {
      ok: false,
      texto: null,
      dadosJson: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      tokensTotal: 0,
      latenciaMs,
      custoEstimado: 0,
      modelo: modelo || this.modeloPadrao,
      provedor: this.nome,
      erro: String(erro),
      codigoStatus: status,
      ehLimiteDeQuota,
    };
  }
}
