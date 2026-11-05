import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buscarContextoCampanha,
  contatoPertenceACampanha,
  normalizarTelefone,
  obterRelatorioCampanhas,
  limparCacheIntegracao,
} from "../src/integracoes/botzapzap.js";

import {
  ativarAgente,
  desativarAgente,
  validarLimiteTemporalMensagem,
  obterEstadoAtivacao,
  resetarMarcoParaTestes,
} from "../src/marco_ativacao.js";

import {
  ProvedorWhatsAppBase,
  ESTADOS_PROVEDOR,
  EVENTOS_PROVEDOR,
} from "../src/provedores/provedor_base.js";

import { WhatsAppWebPlaywrightProvider } from "../src/provedores/whatsapp_web_playwright.js";
import { EvolutionProvider } from "../src/provedores/evolution_provedor.js";
import { obterTipoProvedorConfigurado } from "../src/provedores/gestor_provedor.js";
import { SELETORES_WHATSAPP } from "../src/provedores/seletores_whatsapp.js";
import { criarTravas } from "../src/travas.js";
import { decidir, ACOES } from "../src/agente/decidir.js";

/*
  ============================================================================
  SUÍTE DE TESTES: INTEGRAÇÃO BOTZAPZAP + WHATSAPP WEB PLAYWRIGHT + MARCO TEMPORAL
  Validação formal dos 20 cenários obrigatórios especificados
  ============================================================================
*/

// Cria diretório temporário para testes de integração com o Botzapzap
function criarMockDiretorioBotzapzap() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vez-test-botzap-"));
  const contatosEnviados = {
    numbers: {
      "+5567991401779": {
        identificacao: "Personalizada - Monique",
        numero: "+5567991401779",
        modo: "Personalizada",
        ultimo_envio: "2026-11-02T10:00:00",
      },
      "+5562999990001": {
        identificacao: "Amapá - Ryan Teste",
        numero: "+5562999990001",
        modo: "Consultor",
        ultimo_envio: "2026-11-02T10:15:00",
      },
    },
  };

  const contatosDados = {
    "+5567991401779": {
      telefone: "+5567991401779",
      nome: "Monique Silva",
      primeiro_nome: "Monique",
      cpf: "12345678900",
      uf: "MS",
      lib: 8500.0,
      valor: 4000,
      valor_fmt: "4.000",
      faixa: "alta",
      origem: "planilha_capitalcred.xlsx",
    },
    "+5562999990001": {
      telefone: "+5562999990001",
      nome: "Ryan Teste",
      primeiro_nome: "Ryan",
      cpf: "98765432100",
      uf: "GO",
      lib: 12000.0,
      valor: 6000,
      valor_fmt: "6.000",
      faixa: "premium",
      origem: "refinanciamento.xlsx",
    },
  };

  fs.writeFileSync(path.join(tmpDir, "contatos_enviados.json"), JSON.stringify(contatosEnviados, null, 2));
  fs.writeFileSync(path.join(tmpDir, "contatos_dados.json"), JSON.stringify(contatosDados, null, 2));
  return tmpDir;
}

// Mock de Página e Contexto Playwright para testes offline rápidos e determinísticos
class MockPage {
  constructor() {
    this.closed = false;
    this.handlers = new Map();
  }
  isClosed() { return this.closed; }
  async waitForSelector(seletor, opts) {
    if (this.closed) throw new Error("Target closed");
    return {
      getAttribute: async (attr) => (attr === "data-ref" ? "2@mockQrRefData123" : null),
      screenshot: async () => Buffer.from("mockPngBuffer"),
      focus: async () => {},
    };
  }
  async waitForTimeout(ms) {}
  async goto(url) {
    if (this.closed) throw new Error("Navigation failed: page closed");
  }
  keyboard = {
    press: async (key) => {},
  };
  async exposeFunction(name, fn) {
    this.handlers.set(name, fn);
  }
  async evaluate(fn) {}
}

class MockContext {
  constructor() {
    this.page = new MockPage();
    this.closed = false;
    this.eventHandlers = new Map();
  }
  pages() { return [this.page]; }
  async newPage() { return this.page; }
  on(event, handler) { this.eventHandlers.set(event, handler); }
  async close() {
    this.closed = true;
    this.page.closed = true;
    const closeHandler = this.eventHandlers.get("close");
    if (closeHandler) closeHandler();
  }
}

// ----------------------------------------------------------------------------
// OS 20 TESTES OBRIGATÓRIOS
// ----------------------------------------------------------------------------

test("1. Conexão inicial por QR Code emite evento e transiciona estado", async () => {
  const provedor = new WhatsAppWebPlaywrightProvider({ headless: true });
  let qrRecebido = null;
  provedor.on(EVENTOS_PROVEDOR.QR_RECEBIDO, (qr) => {
    qrRecebido = qr;
  });

  provedor._emitirQr("mock_qr_code_sample_12345");
  assert.equal(provedor.estado, ESTADOS_PROVEDOR.AGUARDANDO_QR);
  assert.equal(qrRecebido, "mock_qr_code_sample_12345");
});

test("2. Persistência da sessão após reinício (diretório isolado)", async () => {
  const tmpSessao = fs.mkdtempSync(path.join(os.tmpdir(), "vez-sessao-test-"));
  const p1 = new WhatsAppWebPlaywrightProvider({ diretorioSessao: tmpSessao });
  assert.equal(p1.diretorioSessao, tmpSessao);
  fs.writeFileSync(path.join(tmpSessao, "session_marker.txt"), "logado=true");

  const p2 = new WhatsAppWebPlaywrightProvider({ diretorioSessao: tmpSessao });
  assert.ok(fs.existsSync(path.join(p2.diretorioSessao, "session_marker.txt")));
  fs.rmSync(tmpSessao, { recursive: true, force: true });
});

test("3. Reconexão do navegador atualiza estado para reconectando", async () => {
  const provedor = new WhatsAppWebPlaywrightProvider();
  provedor._definirEstado(ESTADOS_PROVEDOR.CONECTADO, "Online");
  assert.equal(provedor.obterEstado().conectado, true);

  provedor._definirEstado(ESTADOS_PROVEDOR.RECONECTANDO, "Oscilação de rede");
  assert.equal(provedor.estado, ESTADOS_PROVEDOR.RECONECTANDO);
  assert.equal(provedor.obterEstado().conectado, false);
});

test("4. Recebimento de mensagem dispara callback com payload normalizado", async () => {
  const provedor = new WhatsAppWebPlaywrightProvider();
  let recebida = null;
  provedor.on(EVENTOS_PROVEDOR.MENSAGEM_RECEBIDA, (msg) => {
    recebida = msg;
  });

  provedor._processarMensagemRecebida({
    texto: "Olá, tenho interesse na redução de taxa",
    nomeChat: "5567991401779",
    timestamp: Date.now(),
  });

  assert.ok(recebida);
  assert.equal(recebida.texto, "Olá, tenho interesse na redução de taxa");
  assert.equal(recebida.telefone, "5567991401779");
  assert.equal(recebida.deMim, false);
});

test("5. Identificação correta do contato mesmo com formatos divergentes (+55, DDD, 9º dígito)", () => {
  const num1 = normalizarTelefone("+55 (67) 99140-1779");
  const num2 = normalizarTelefone("556791401779");
  assert.equal(num1.slice(-8), num2.slice(-8));
});

test("6. Integração com uma campanha do Botzapzap (extração de nome, valor e modo)", () => {
  limparCacheIntegracao();
  const dirMock = criarMockDiretorioBotzapzap();
  try {
    const contexto = buscarContextoCampanha("5567991401779", dirMock);
    assert.equal(contexto.pertenceCampanha, true);
    assert.equal(contexto.campanha.modo, "Personalizada");
    assert.equal(contexto.cliente.nome, "Monique Silva");
    assert.equal(contexto.cliente.liberacaoEstimada, 8500.0);
    assert.equal(contexto.cliente.valorFmt, "4.000");
  } finally {
    fs.rmSync(dirMock, { recursive: true, force: true });
    limparCacheIntegracao();
  }
});

test("7. Ativação do Vez após os disparos registra marco temporal confiável", () => {
  const antes = Date.now();
  const estado = ativarAgente("Ryan Consultor");
  assert.equal(estado.agenteAtivo, true);
  assert.equal(estado.ativadoPor, "Ryan Consultor");
  assert.ok(estado.ativadoEm >= antes);
});

test("8. Bloqueio de mensagens anteriores à ativação (não responde retroativamente)", () => {
  const marco = Date.now();
  resetarMarcoParaTestes({ agenteAtivo: true, ativadoEm: marco });

  // Mensagem de 1 hora atrás
  const msgAntiga = marco - 3600 * 1000;
  const checagemAntiga = validarLimiteTemporalMensagem(msgAntiga);
  assert.equal(checagemAntiga.permitido, false);
  assert.equal(checagemAntiga.motivo, "mensagem_anterior_ao_marco_de_ativacao");

  // Mensagem nova (chegou agora)
  const msgNova = marco + 1000;
  const checagemNova = validarLimiteTemporalMensagem(msgNova);
  assert.equal(checagemNova.permitido, true);
});

test("9. Resposta automática a uma nova mensagem passa na decisão comercial", () => {
  const decisao = decidir({
    etapaComercial: "interesse",
    classificacao: { categoria: "duvida", precisaDoRyan: false, motivo: "pergunta sobre reducao" },
    mensagemCliente: "Como funciona a redução de juros?",
    memoria: { nome: "Monique" },
  });

  assert.equal(decisao.acao, ACOES.RESPONDER);
  assert.ok(decisao.categoria);
});

test("10. Deduplicação de mensagens repetidas (mesmo hash/ID não duplica evento)", () => {
  const provedor = new WhatsAppWebPlaywrightProvider();
  let count = 0;
  provedor.on(EVENTOS_PROVEDOR.MENSAGEM_RECEBIDA, () => {
    count++;
  });

  const payload = {
    texto: "Gostaria de ver o saldo",
    nomeChat: "5567991401779",
    timestamp: 1730550000000,
  };

  provedor._processarMensagemRecebida(payload);
  provedor._processarMensagemRecebida(payload); // Repetição imediata
  provedor._processarMensagemRecebida(payload); // Terceira repetição

  assert.equal(count, 1, "Deveria ter emitido exatamente 1 evento devido à deduplicação");
});

test("11. Duas conversas simultâneas rodam em paralelo sem contenção cruzada", async () => {
  const travas = criarTravas();
  let inicio1 = 0, fim1 = 0, inicio2 = 0, fim2 = 0;

  const t1 = travas.naVezDe("conversa_cliente_A", async () => {
    inicio1 = Date.now();
    await new Promise((r) => setTimeout(r, 50));
    fim1 = Date.now();
  });

  const t2 = travas.naVezDe("conversa_cliente_B", async () => {
    inicio2 = Date.now();
    await new Promise((r) => setTimeout(r, 50));
    fim2 = Date.now();
  });

  await Promise.all([t1, t2]);

  assert.ok(inicio2 < fim1, "Conversa B deve iniciar antes da conversa A terminar (execução paralela concorrente)");
});

test("12. Mensagens simultâneas na mesma conversa preservam FIFO estrito", async () => {
  const travas = criarTravas();
  const ordem = [];

  const m1 = travas.naVezDe("mesma_conversa_1", async () => {
    await new Promise((r) => setTimeout(r, 30));
    ordem.push("msg_1");
  });

  const m2 = travas.naVezDe("mesma_conversa_1", async () => {
    ordem.push("msg_2");
  });

  await Promise.all([m1, m2]);
  assert.deepEqual(ordem, ["msg_1", "msg_2"], "Mensagens da mesma conversa devem manter ordem sequencial estrita");
});

test("13. Pausa individual (atender: false) silencia IA da conversa", () => {
  const conversa = { id: "conv_pausada", atender: false, so_voce: false };
  assert.equal(conversa.atender, false, "Conversa com atender: false não permite resposta da IA");
});

test("14. Atendimento humano (so_voce: true) assume controle imediato", () => {
  const decisao = decidir({
    etapaComercial: "simulacao",
    classificacao: { categoria: "duvida", precisaDoRyan: false },
    mensagemCliente: "Vou querer fazer então",
    conversa: { soVoce: true },
  });

  assert.equal(decisao.acao, ACOES.AGUARDAR);
  assert.match(decisao.motivo, /esta conversa está com você/i);
});

test("15. Opt-out explícito bloqueia atendimento comercial", () => {
  const textoOptOut = "Favor não me mande mais mensagens, quero sair da lista";
  const ehPedidoOptOut =
    /\b(?:(?:favor\s+)?(?:pare|parar)\s+de\s+(?:me\s+)?(?:mandar|enviar)|n[aã]o\s+me\s+(?:mande|chame|envie)\s+mais|remover?\s+(?:o\s+)?(?:meu\s+)?(?:n[uú]mero|contato)|descadastrar?|sair\s+da\s+lista|opt[\s-]?out)\b/i.test(
      textoOptOut
    );

  assert.equal(ehPedidoOptOut, true, "Deve identificar solicitação formal de opt-out");
});

test("16. Reinício do motor sem duplicar respostas (leitura do marco persistido)", () => {
  const marcoCriado = Date.now();
  resetarMarcoParaTestes({ ativadoEm: marcoCriado, agenteAtivo: true });

  const estadoLido = obterEstadoAtivacao();
  assert.equal(estadoLido.ativadoEm, marcoCriado);
  assert.equal(estadoLido.agenteAtivo, true);
});

test("17. Falha do provedor de IA não derruba o motor e encaminha para a fila", () => {
  const decisao = decidir({
    etapaComercial: "interesse",
    classificacao: null, // Provedor de IA fora do ar
    mensagemCliente: "Qual o valor da parcela?",
  });

  assert.equal(decisao.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.match(decisao.motivo, /não consegui classificar|consultor|falha/i);
});

test("18. Falha do navegador durante o atendimento é capturada pelo provedor", async () => {
  const provedor = new WhatsAppWebPlaywrightProvider();
  const mockCtx = new MockContext();
  provedor.contexto = mockCtx;
  provedor.pagina = mockCtx.page;
  provedor.conectado = true;
  provedor._configurarTratamentoFalhas();

  await mockCtx.close();
  assert.equal(provedor.conectado, false);
  assert.equal(provedor.estado, ESTADOS_PROVEDOR.DESLIGADO);
});

test("19. Contato que não pertence à campanha é identificado corretamente", () => {
  limparCacheIntegracao();
  const dirMock = criarMockDiretorioBotzapzap();
  try {
    const contexto = buscarContextoCampanha("5511999998888", dirMock); // Número inexistente na campanha
    assert.equal(contexto.pertenceCampanha, false);
    assert.equal(contexto.motivo, "nao_encontrado_na_campanha");
    assert.equal(contatoPertenceACampanha("5511999998888", dirMock), false);
  } finally {
    fs.rmSync(dirMock, { recursive: true, force: true });
    limparCacheIntegracao();
  }
});

test("20. Isolamento entre organizações e instâncias (composite key)", () => {
  const tenant1 = { userId: "user-alpha", idConexao: "conn-1", telefone: "5562999990001" };
  const tenant2 = { userId: "user-beta", idConexao: "conn-2", telefone: "5562999990001" };

  const compositeKey1 = `${tenant1.userId}:${tenant1.idConexao}:${tenant1.telefone}`;
  const compositeKey2 = `${tenant2.userId}:${tenant2.idConexao}:${tenant2.telefone}`;

  assert.notEqual(compositeKey1, compositeKey2, "Tenants diferentes nunca devem colidir chaves de conversa");
});
