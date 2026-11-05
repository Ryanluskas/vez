import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  ehConversaIndividual,
  normalizarTelefone,
  extrairTextoEvolution,
  ehDocumentoOuImagem,
  criarServidorWebhook,
} from "../src/evolution/webhook.js";
import { criarClienteEvolution } from "../src/evolution/cliente.js";

test("ehConversaIndividual reconhece apenas conversas de clientes reais", () => {
  assert.equal(ehConversaIndividual("5511999999999@s.whatsapp.net"), true);
  assert.equal(ehConversaIndividual("5511999999999@c.us"), true);
  assert.equal(ehConversaIndividual("123456789@lid"), true);
  assert.equal(ehConversaIndividual("120363024849202@g.us"), false);
  assert.equal(ehConversaIndividual("status@broadcast"), false);
  assert.equal(ehConversaIndividual(""), false);
  assert.equal(ehConversaIndividual(null), false);
});

test("normalizarTelefone extrai somente os dígitos do número", () => {
  assert.equal(normalizarTelefone("5511999999999@s.whatsapp.net"), "5511999999999");
  assert.equal(normalizarTelefone("+55 (11) 98888-7777@c.us"), "5511988887777");
  assert.equal(normalizarTelefone(""), "");
});

test("extrairTextoEvolution obtém texto de diferentes tipos de mensagem", () => {
  assert.equal(
    extrairTextoEvolution({ message: { conversation: "Olá, bom dia" } }),
    "Olá, bom dia"
  );
  assert.equal(
    extrairTextoEvolution({
      message: { extendedTextMessage: { text: "Quero uma simulação" } },
    }),
    "Quero uma simulação"
  );
  assert.equal(
    extrairTextoEvolution({
      message: { imageMessage: { caption: "Foto do meu contracheque" } },
    }),
    "Foto do meu contracheque"
  );
  assert.equal(
    extrairTextoEvolution({ messageType: "stickerMessage", message: {} }),
    "[figurinha]"
  );
  assert.equal(
    extrairTextoEvolution({ messageType: "audioMessage", message: {} }),
    "[áudio]"
  );
});

test("ehDocumentoOuImagem detecta mídias documentais corretamente", () => {
  assert.equal(ehDocumentoOuImagem({ messageType: "imageMessage" }), true);
  assert.equal(ehDocumentoOuImagem({ messageType: "documentMessage" }), true);
  assert.equal(
    ehDocumentoOuImagem({ message: { documentMessage: { title: "doc.pdf" } } }),
    true
  );
  assert.equal(ehDocumentoOuImagem({ messageType: "conversation" }), false);
});

test("Servidor Webhook valida secret e rejeita requisições sem autorização", async () => {
  const secret = "meu_segredo_teste_123";
  const porta = 3899;

  const mockFluxo = {
    registrar: async () => ({ jaVista: false }),
    processarRecebida: async () => {},
    marcarDocumentoRecebido: async () => {},
  };

  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  const webhook = criarServidorWebhook({
    fluxo: mockFluxo,
    supabase: mockSupabase,
    porta,
    webhookSecret: secret,
  });

  const servidor = webhook.iniciar();

  try {
    // 1. Requisição GET /health deve responder 200
    const resHealth = await fetch(`http://localhost:${porta}/health`);
    assert.equal(resHealth.status, 200);
    const jsonHealth = await resHealth.json();
    assert.equal(jsonHealth.status, "ok");

    // 2. Requisição POST /webhook sem secret deve ser 401
    const resSemAuth = await fetch(`http://localhost:${porta}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "messages.upsert" }),
    });
    assert.equal(resSemAuth.status, 401);

    // 3. Requisição POST /webhook com secret correto deve ser 200
    const resComAuth = await fetch(`http://localhost:${porta}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({ event: "messages.upsert", data: {} }),
    });
    assert.equal(resComAuth.status, 200);
  } finally {
    webhook.parar();
  }
});

test("Servidor Webhook aplica deduplicação de eventos (idempotência)", async () => {
  let chamadasProcessar = 0;
  const mockFluxo = {
    registrar: async () => ({ jaVista: false, atender: true }),
    processarRecebida: async () => {
      chamadasProcessar++;
    },
    marcarDocumentoRecebido: async () => {},
  };

  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: "conexao-1", apelido: "Teste" } }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  const webhook = criarServidorWebhook({
    fluxo: mockFluxo,
    supabase: mockSupabase,
    porta: 3898,
    webhookSecret: null,
  });

  const payload = {
    event: "messages.upsert",
    instance: "instancia_teste",
    data: {
      key: {
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
        id: "MSG_DUPLICADA_ID_999",
      },
      pushName: "Cliente Teste",
      message: { conversation: "Olá, quero simular" },
    },
  };

  // Primeira entrega
  await webhook.processarEvento(payload);
  assert.equal(chamadasProcessar, 1);

  // Segunda entrega (reentrega da Evolution)
  await webhook.processarEvento(payload);
  // Deve continuar 1 (não processa duas vezes!)
  assert.equal(chamadasProcessar, 1);
});

test("Cliente Evolution monta URLs e headers corretos", async () => {
  let requisicaoRecebida = null;

  const mockServer = http.createServer(async (req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      requisicaoRecebida = {
        url: req.url,
        metodo: req.method,
        apikey: req.headers["apikey"],
        corpo: corpo ? JSON.parse(corpo) : null,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "SUCCESS" }));
    });
  });

  const portaMock = 3897;
  await new Promise((resolve) => mockServer.listen(portaMock, resolve));

  try {
    const cliente = criarClienteEvolution({
      serverUrl: `http://localhost:${portaMock}`,
      apiKey: "chave_teste_123",
    });

    await cliente.enviarTexto({
      nomeInstancia: "instancia_ryan",
      numero: "5511999998888",
      texto: "Olá mundo",
    });

    assert.ok(requisicaoRecebida);
    assert.equal(requisicaoRecebida.metodo, "POST");
    assert.equal(requisicaoRecebida.url, "/message/sendText/instancia_ryan");
    assert.equal(requisicaoRecebida.apikey, "chave_teste_123");
    assert.equal(requisicaoRecebida.corpo.number, "5511999998888");
    assert.equal(requisicaoRecebida.corpo.text, "Olá mundo");
  } finally {
    mockServer.close();
  }
});
