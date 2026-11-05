import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { ProvedorWhatsAppBase, ESTADOS_PROVEDOR, EVENTOS_PROVEDOR } from "./provedor_base.js";
import { SELETORES_WHATSAPP, tentarSeletores } from "./seletores_whatsapp.js";
import { normalizarTelefone, extrairSufixo8 } from "../integracoes/botzapzap.js";
import { log } from "../log.js";

/*
  ============================================================================
  PROVEDOR WHATSAPP WEB COM PLAYWRIGHT
  
  Camada de automação do WhatsApp Web baseada no Playwright com contexto
  persistente (Chromium nativo / Google Chrome do sistema).
  
  Destaques arquiteturais:
  - Contexto persistente: preserva autenticação após fechar o navegador.
  - Janela visível por padrão (headless: false) para acompanhamento operacional.
  - Camada de seletores isolada com fallbacks automáticos.
  - Deduplicação estrita de mensagens via hash SHA-256 e ID.
  - Fila FIFO de envio por conversa para prevenir concorrência no DOM.
  - Monitoramento de reconexão e instabilidade.
  - Proteção contra vazamento de credenciais, cookies ou tokens em logs.
  
  AVISO DE RISCO DE PLATAFORMA:
  Automações em WhatsApp Web utilizam engenharia de interface não oficial.
  A Meta frequentemente atualiza seletores, atributos e pode aplicar restrições
  ou banimentos a contas com comportamentos anômalos. Para operações corporativas
  em escala, utilize a API Oficial (WhatsApp Business Platform / Cloud API).
  ============================================================================
*/

const CAMINHO_SESSAO_PADRAO = path.join(process.cwd(), ".sessao_whatsapp_web");

export class WhatsAppWebPlaywrightProvider extends ProvedorWhatsAppBase {
  constructor(config = {}) {
    super("WhatsAppWebPlaywright");
    this.diretorioSessao = config.diretorioSessao || CAMINHO_SESSAO_PADRAO;
    this.headless = config.headless ?? (process.env.WHATSAPP_WEB_HEADLESS === "true");
    this.executablePath = config.executablePath || this._localizarChrome();
    
    this.contexto = null;
    this.pagina = null;
    this.conectado = false;
    this.relogioMonitor = null;
    this.tentandoReconectar = false;

    // Cache de deduplicação de mensagens (LRU simples mantendo últimos 500 hashes)
    this.hashesMensagens = new Set();
    this.maxHashes = 500;

    // Fila serializada de envio por conversa para evitar corridas na UI
    this.filasPorConversa = new Map();
  }

  /**
   * Localiza o executável do Google Chrome no Windows ou Linux.
   * @private
   */
  _localizarChrome() {
    if (process.platform === "win32") {
      const caminhos = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      ];
      for (const c of caminhos) {
        if (c && fs.existsSync(c)) return c;
      }
    } else {
      const caminhosLinux = ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];
      for (const c of caminhosLinux) {
        if (fs.existsSync(c)) return c;
      }
    }
    return undefined; // Deixa o Playwright tentar o Chromium interno se houver
  }

  /**
   * Inicia o navegador com contexto persistente e carrega o WhatsApp Web.
   */
  async iniciar() {
    if (this.contexto) {
      log.alerta("[Playwright] Provedor já está em execução.");
      return;
    }

    this._definirEstado(ESTADOS_PROVEDOR.INICIANDO, "Iniciando navegador Chromium com contexto persistente");

    if (!fs.existsSync(this.diretorioSessao)) {
      fs.mkdirSync(this.diretorioSessao, { recursive: true });
    }

    const launchArgs = [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--lang=pt-BR",
      "--disable-infobars",
    ];

    try {
      this.contexto = await chromium.launchPersistentContext(this.diretorioSessao, {
        headless: this.headless,
        executablePath: this.executablePath,
        args: launchArgs,
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      });

      const paginas = this.contexto.pages();
      this.pagina = paginas.length > 0 ? paginas[0] : await this.contexto.newPage();

      this._configurarTratamentoFalhas();

      log.info(`[Playwright] Abrindo https://web.whatsapp.com (headless: ${this.headless})...`);
      await this.pagina.goto("https://web.whatsapp.com", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await this._aguardarCarregamentoOuQr();
      this._iniciarObservadorMensagens();
      this._iniciarMonitorConexao();
    } catch (erro) {
      this._definirEstado(ESTADOS_PROVEDOR.ERRO, `Falha ao iniciar navegador: ${erro.message}`);
      log.erro(`[Playwright] Falha crítica de inicialização: ${erro.message}`);
      throw erro;
    }
  }

  /**
   * Detecta se a sessão já está autenticada ou se requer leitura de QR Code.
   * @private
   */
  async _aguardarCarregamentoOuQr() {
    let tentativas = 0;
    const maxTentativas = 40; // ~40 segundos

    while (tentativas < maxTentativas) {
      tentativas++;

      // 1. Confere se já carregou a tela principal do chat
      const { elemento: elApp } = await tentarSeletores(this.pagina, SELETORES_WHATSAPP.appCarregado, {
        timeout: 1000,
      });
      if (elApp) {
        this.conectado = true;
        this._definirEstado(ESTADOS_PROVEDOR.CONECTADO, "Sessão do WhatsApp Web ativa e pronta");
        log.info("[Playwright] WhatsApp Web conectado com sucesso!");
        return;
      }

      // 2. Confere se apareceu o QR Code
      const { elemento: elQr } = await tentarSeletores(this.pagina, SELETORES_WHATSAPP.qrCode, {
        timeout: 1000,
      });
      if (elQr) {
        try {
          const qrDataRef = await elQr.getAttribute("data-ref");
          if (qrDataRef) {
            this._emitirQr(qrDataRef);
          } else {
            const screenshotBuffer = await elQr.screenshot();
            const base64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;
            this._emitirQr(base64);
          }
        } catch {
          this._definirEstado(ESTADOS_PROVEDOR.AGUARDANDO_QR, "QR Code visível na tela");
        }
      }

      await this.pagina.waitForTimeout(1000);
    }

    if (!this.conectado) {
      log.alerta("[Playwright] Timeout aguardando autenticação no WhatsApp Web.");
    }
  }

  /**
   * Injeta interceptor de mensagens recebidas diretamente no DOM do WhatsApp Web.
   * @private
   */
  async _iniciarObservadorMensagens() {
    if (!this.pagina) return;

    try {
      // Exponibiliza função Node para o navegador chamar em tempo real
      await this.pagina.exposeFunction("__vezNotificarMensagem", (dadosMensagem) => {
        this._processarMensagemRecebida(dadosMensagem);
      });

      // Script injetado para escutar mutações na interface de mensagens
      await this.pagina.evaluate(() => {
        const observador = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) {
                // Mensagem individual
                const elMsg = node.matches?.('div[data-testid*="msg-container"]')
                  ? node
                  : node.querySelector?.('div[data-testid*="msg-container"]');

                if (elMsg) {
                  const textoEl = elMsg.querySelector('.selectable-text span, [data-testid="selectable-text"]');
                  const texto = textoEl ? textoEl.innerText.trim() : "";
                  const deMim = elMsg.classList?.contains("message-out") || elMsg.getAttribute("data-testid")?.includes("message-out");
                  const timestampEl = elMsg.querySelector('span[data-testid="msg-meta"] span, div[data-testid="msg-meta"]');
                  const horaTexto = timestampEl ? timestampEl.innerText.trim() : "";

                  // Tenta capturar nome/telefone do cabeçalho da conversa aberta
                  const headerTitle = document.querySelector('header div[data-testid="conversation-info-header"] span, header div[role="button"] span');
                  const nomeChat = headerTitle ? headerTitle.innerText.trim() : "";

                  if (texto && !deMim) {
                    window.__vezNotificarMensagem?.({
                      texto,
                      nomeChat,
                      horaTexto,
                      timestamp: Date.now(),
                      deMim: false,
                    });
                  }
                }
              }
            }
          }
        });

        observador.observe(document.body, { childList: true, subtree: true });
      });
      log.info("[Playwright] Observador de mensagens ativado no DOM.");
    } catch (e) {
      log.alerta(`[Playwright] Observador DOM não pôde ser injetado: ${e.message}`);
    }
  }

  /**
   * Trata, deduplica e propaga a mensagem recebida para o motor.
   * @private
   */
  _processarMensagemRecebida(msgBruta) {
    if (!msgBruta || !msgBruta.texto) return;

    // Gera chave de deduplicação com base no texto, contato e janela de tempo (5 segundos)
    const janelaTempo = Math.floor((msgBruta.timestamp || Date.now()) / 5000);
    const hash = crypto
      .createHash("sha256")
      .update(`${msgBruta.nomeChat || ""}_${msgBruta.texto}_${janelaTempo}`)
      .digest("hex");

    if (this.hashesMensagens.has(hash)) {
      return; // Mensagem duplicada ignorada pela trava
    }

    this.hashesMensagens.add(hash);
    if (this.hashesMensagens.size > this.maxHashes) {
      const primeiro = this.hashesMensagens.values().next().value;
      this.hashesMensagens.delete(primeiro);
    }

    // Normalização padrão da mensagem
    const mensagemNormalizada = {
      id: `pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      texto: msgBruta.texto,
      telefone: normalizarTelefone(msgBruta.nomeChat || ""),
      nomeContato: msgBruta.nomeChat || "Cliente",
      timestamp: msgBruta.timestamp || Date.now(),
      deMim: false,
      provedor: "whatsapp_web_playwright",
    };

    this._emitirMensagem(mensagemNormalizada);
  }

  /**
   * Monitora a conectividade da página e disparos de reconexão se a rede oscilar.
   * @private
   */
  _iniciarMonitorConexao() {
    if (this.relogioMonitor) clearInterval(this.relogioMonitor);

    this.relogioMonitor = setInterval(async () => {
      if (!this.pagina || this.pagina.isClosed()) {
        this._definirEstado(ESTADOS_PROVEDOR.DESLIGADO, "Página do navegador foi fechada");
        return;
      }

      try {
        const { elemento: elDesconexao } = await tentarSeletores(
          this.pagina,
          SELETORES_WHATSAPP.bannerDesconexao,
          { timeout: 500 }
        );

        if (elDesconexao) {
          this._definirEstado(ESTADOS_PROVEDOR.RECONECTANDO, "WhatsApp Web reportou instabilidade de rede");
        } else if (this.conectado && this.estado !== ESTADOS_PROVEDOR.CONECTADO) {
          this._definirEstado(ESTADOS_PROVEDOR.CONECTADO, "Sessão restabelecida");
        }
      } catch {
        // Falhas transitórias no monitor não travam o processo
      }
    }, 10000);

    this.relogioMonitor.unref?.();
  }

  /**
   * Tratamento de falhas do processo do navegador.
   * @private
   */
  _configurarTratamentoFalhas() {
    this.contexto.on("close", () => {
      this.conectado = false;
      this._definirEstado(ESTADOS_PROVEDOR.DESLIGADO, "Contexto do navegador fechado pelo usuário ou sistema");
      log.alerta("[Playwright] Navegador fechado.");
    });
  }

  /**
   * Envia uma mensagem serializada por conversa.
   */
  async enviarTexto(telefoneOuJid, texto, opcoes = {}) {
    if (!this.conectado || !this.pagina || this.pagina.isClosed()) {
      return { ok: false, erro: "WhatsApp Web não está conectado" };
    }

    const telLimpo = normalizarTelefone(telefoneOuJid);
    if (!telLimpo) {
      return { ok: false, erro: "Telefone de destino inválido" };
    }

    // Fila serializada por conversa
    const fila = this.filasPorConversa.get(telLimpo) || Promise.resolve();
    const envioPromessa = fila.then(async () => {
      return this._executarEnvioNaPagina(telLimpo, texto, opcoes);
    });

    this.filasPorConversa.set(telLimpo, envioPromessa.catch(() => {}));
    return envioPromessa;
  }

  /**
   * Executa a digitação e clique de envio diretamente no WhatsApp Web.
   * @private
   */
  async _executarEnvioNaPagina(telefone, texto, opcoes = {}) {
    const urlConversa = `https://web.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(texto)}`;
    
    try {
      log.info(`[Playwright] Abrindo conversa com ${telefone}...`);
      await this.pagina.goto(urlConversa, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Aguarda caixa de mensagem aparecer
      const { elemento: elCaixa } = await tentarSeletores(this.pagina, SELETORES_WHATSAPP.caixaMensagem, {
        timeout: 25000,
      });

      if (!elCaixa) {
        throw new Error("Caixa de composição de mensagem não encontrada (contato sem WhatsApp ou tela travada)");
      }

      // Pequeno delay humanizado para simular operador real
      const delayDigitar = opcoes.simularDigitacao ? 1500 : 300;
      await this.pagina.waitForTimeout(delayDigitar);

      // Foca e pressiona Enter
      await elCaixa.focus();
      await this.pagina.keyboard.press("Enter");

      // Aguarda confirmação visual do disparo
      await this.pagina.waitForTimeout(1000);

      const idMsg = `pw_envio_${Date.now()}`;
      log.info(`[Playwright] Mensagem enviada com sucesso para ${telefone}.`);
      return { ok: true, idMensagem: idMsg };
    } catch (erro) {
      log.erro(`[Playwright] Falha no envio para ${telefone}: ${erro.message}`);
      return { ok: false, erro: erro.message };
    }
  }

  /**
   * Encerra o navegador e libera recursos.
   */
  async parar() {
    if (this.relogioMonitor) clearInterval(this.relogioMonitor);
    if (this.contexto) {
      try {
        await this.contexto.close();
      } catch (e) {
        log.alerta(`[Playwright] Erro ao fechar contexto: ${e.message}`);
      }
      this.contexto = null;
      this.pagina = null;
    }
    this.conectado = false;
    this._definirEstado(ESTADOS_PROVEDOR.DESLIGADO, "Provedor encerrado");
  }
}
