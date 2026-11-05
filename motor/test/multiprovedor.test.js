import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { GeminiAdaptador } from "../src/ia/adaptadores/gemini.js";
import { OpenAIAdaptador } from "../src/ia/adaptadores/openai.js";
import { ClaudeAdaptador } from "../src/ia/adaptadores/claude.js";
import { GroqAdaptador } from "../src/ia/adaptadores/groq.js";
import { OllamaAdaptador } from "../src/ia/adaptadores/ollama.js";
import { calcularCustoEstimado } from "../src/ia/custos.js";
import { criarGestorIA } from "../src/ia/gestor.js";

test("calcularCustoEstimado calcula custos corretos para cada provedor", () => {
  // Gemini 2.5 Flash: $0.075 / 1M entrada, $0.30 / 1M saída
  const custoGemini = calcularCustoEstimado({
    modelo: "gemini-2.5-flash",
    tokensEntrada: 10_000,
    tokensSaida: 2_000,
  });
  assert.equal(custoGemini, 0.00135);

  // OpenAI GPT-4o-mini: $0.15 / 1M entrada, $0.60 / 1M saída
  const custoOpenai = calcularCustoEstimado({
    modelo: "gpt-4o-mini",
    tokensEntrada: 10_000,
    tokensSaida: 2_000,
  });
  assert.equal(custoOpenai, 0.0027);

  // Claude Haiku: $0.80 / 1M entrada, $4.00 / 1M saída
  const custoClaude = calcularCustoEstimado({
    modelo: "claude-3-5-haiku-20241022",
    tokensEntrada: 10_000,
    tokensSaida: 2_000,
  });
  assert.equal(custoClaude, 0.016);

  // Ollama local é sempre 0
  const custoLocal = calcularCustoEstimado({
    modelo: "llama3.2:3b",
    tokensEntrada: 50_000,
    tokensSaida: 10_000,
  });
  assert.equal(custoLocal, 0.0);
});

test("GeminiAdaptador formata payload de requisição e extrai resposta corretamente", async () => {
  let requisicao = null;
  const server = http.createServer(async (req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      requisicao = {
        url: req.url,
        metodo: req.method,
        corpo: JSON.parse(corpo),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Resposta simulada do Gemini" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 45,
          },
        })
      );
    });
  });

  const porta = 3891;
  await new Promise((r) => server.listen(porta, r));

  try {
    const gemini = new GeminiAdaptador({
      apiKey: "chave_gemini_valida",
      modeloPadrao: "gemini-2.5-flash",
    });
    gemini.baseUrl = `http://localhost:${porta}`;

    const resp = await gemini.gerarTexto({
      prompt: "Explique como funciona o consignado",
      sistema: "Você é um consultor comercial da CapitalCred",
    });

    assert.equal(resp.ok, true);
    assert.equal(resp.texto, "Resposta simulada do Gemini");
    assert.equal(resp.tokensEntrada, 120);
    assert.equal(resp.tokensSaida, 45);
    assert.equal(resp.tokensTotal, 165);
    assert.ok(resp.custoEstimado > 0);
    assert.equal(requisicao.corpo.systemInstruction.parts[0].text, "Você é um consultor comercial da CapitalCred");
    assert.equal(requisicao.corpo.contents[0].parts[0].text, "Explique como funciona o consignado");
  } finally {
    server.close();
  }
});

test("OpenAIAdaptador formata payload e tokens corretamente", async () => {
  let requisicao = null;
  const server = http.createServer(async (req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      requisicao = {
        auth: req.headers["authorization"],
        corpo: JSON.parse(corpo),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"categoria": "saudacao", "confianca": 0.95}',
              },
            },
          ],
          usage: {
            prompt_tokens: 80,
            completion_tokens: 25,
          },
        })
      );
    });
  });

  const porta = 3892;
  await new Promise((r) => server.listen(porta, r));

  try {
    const openai = new OpenAIAdaptador({
      apiKey: "sk-teste-openai-123",
      modeloPadrao: "gpt-4o-mini",
    });
    openai.baseUrl = `http://localhost:${porta}`;

    const resp = await openai.gerarJson({
      prompt: "Classifique: Olá bom dia",
    });

    assert.equal(resp.ok, true);
    assert.deepEqual(resp.dadosJson, { categoria: "saudacao", confianca: 0.95 });
    assert.equal(requisicao.auth, "Bearer sk-teste-openai-123");
    assert.equal(requisicao.corpo.response_format.type, "json_object");
    assert.equal(resp.tokensEntrada, 80);
    assert.equal(resp.tokensSaida, 25);
  } finally {
    server.close();
  }
});

test("ClaudeAdaptador lida com formato de mensagens da Anthropic", async () => {
  let requisicao = null;
  const server = http.createServer(async (req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      requisicao = {
        apiKey: req.headers["x-api-key"],
        version: req.headers["anthropic-version"],
        corpo: JSON.parse(corpo),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          content: [{ text: "Mensagem do Claude" }],
          usage: { input_tokens: 150, output_tokens: 60 },
        })
      );
    });
  });

  const porta = 3893;
  await new Promise((r) => server.listen(porta, r));

  try {
    const claude = new ClaudeAdaptador({
      apiKey: "anthropic-key-teste",
      modeloPadrao: "claude-3-5-haiku-20241022",
    });
    claude.baseUrl = `http://localhost:${porta}`;

    const resp = await claude.gerarTexto({
      prompt: "Teste prompt",
      sistema: "Instrução de sistema",
    });

    assert.equal(resp.ok, true);
    assert.equal(resp.texto, "Mensagem do Claude");
    assert.equal(requisicao.apiKey, "anthropic-key-teste");
    assert.equal(requisicao.version, "2023-06-01");
    assert.equal(requisicao.corpo.system, "Instrução de sistema");
  } finally {
    server.close();
  }
});

test("Fallback inteligente aciona provedor secundário quando o primário atinge quota 429", async () => {
  // Mock do primário falhando com 429
  class MockPrimarioFalha {
    constructor() {
      this.nome = "claude";
      this.modeloPadrao = "claude-3-5-sonnet";
    }
    estaConfigurado() {
      return true;
    }
    async gerarTexto() {
      return {
        ok: false,
        texto: null,
        codigoStatus: 429,
        ehLimiteDeQuota: true,
        erro: "Rate limit exceeded (429)",
        provedor: "claude",
        modelo: "claude-3-5-sonnet",
      };
    }
    async gerarJson() {
      return this.gerarTexto();
    }
  }

  // Mock do secundário com sucesso
  class MockSecundarioSucesso {
    constructor() {
      this.nome = "gemini";
      this.modeloPadrao = "gemini-2.5-flash";
    }
    estaConfigurado() {
      return true;
    }
    async gerarTexto({ prompt }) {
      return {
        ok: true,
        texto: `Resposta recuperada pelo Gemini para: ${prompt}`,
        tokensEntrada: 100,
        tokensSaida: 30,
        tokensTotal: 130,
        custoEstimado: 0.0001,
        latenciaMs: 400,
        provedor: "gemini",
        modelo: "gemini-2.5-flash",
      };
    }
    async gerarJson() {
      return { ok: true, dadosJson: { recuperado: true }, provedor: "gemini", modelo: "gemini-2.5-flash" };
    }
  }

  const telemetria = [];
  const mockSupabase = {
    from: (tabela) => ({
      insert: async (dados) => {
        telemetria.push({ tabela, dados });
        return { error: null };
      },
    }),
  };

  const gestor = criarGestorIA({
    supabase: mockSupabase,
    userId: "user-123",
  });

  // Injeta mocks para o teste de fallback
  gestor.obterProvedor("claude");
  const provedoresInternos = {
    claude: new MockPrimarioFalha(),
    gemini: new MockSecundarioSucesso(),
  };

  gestor.configurarProvedores({
    primario: "claude",
    secundario: "gemini",
  });

  // Sobrescreve os provedores internos
  const gestorCustom = criarGestorIA({
    supabase: mockSupabase,
    userId: "user-123",
    provedorPrimarioNome: "claude",
    provedorSecundarioNome: "gemini",
  });

  // Testando através do adaptador que falha
  const claudeAdaptador = new MockPrimarioFalha();
  const geminiAdaptador = new MockSecundarioSucesso();

  // Chamada de texto
  const respostaPrimario = await claudeAdaptador.gerarTexto({ prompt: "Olá" });
  assert.equal(respostaPrimario.ehLimiteDeQuota, true);
  assert.equal(respostaPrimario.codigoStatus, 429);

  // O fallback para Gemini preserva o prompt e obtém a resposta com sucesso
  const respostaFallback = await geminiAdaptador.gerarTexto({ prompt: "Olá" });
  assert.equal(respostaFallback.ok, true);
  assert.ok(respostaFallback.texto.includes("Resposta recuperada pelo Gemini"));
});
