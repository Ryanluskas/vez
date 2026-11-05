import { ProvedorWhatsAppBase, ESTADOS_PROVEDOR } from "./provedor_base.js";
import { criarClienteEvolution } from "../evolution/cliente.js";
import { log } from "../log.js";

/*
  ============================================================================
  PROVEDOR EVOLUTION API V2 (ADAPTER)
  
  Encapsula a comunicação com a Evolution API v2 sob o contrato unificado
  ProvedorWhatsAppBase, mantendo total compatibilidade com contêineres Docker
  e webhooks existentes.
  ============================================================================
*/

export class EvolutionProvider extends ProvedorWhatsAppBase {
  constructor(config = {}) {
    super("EvolutionAPI");
    this.serverUrl = config.serverUrl || process.env.EVOLUTION_SERVER_URL || "http://localhost:8080";
    this.apiKey = config.apiKey || process.env.EVOLUTION_API_KEY || "";
    this.instancia = config.instancia || process.env.EVOLUTION_INSTANCIA || "vez_principal";
    this.cliente = criarClienteEvolution({
      serverUrl: this.serverUrl,
      apiKey: this.apiKey,
    });
  }

  async iniciar() {
    this._definirEstado(ESTADOS_PROVEDOR.INICIANDO, `Conectando à Evolution API em ${this.serverUrl}`);
    try {
      const estadoBruto = this.cliente.obterEstadoConexao
        ? await this.cliente.obterEstadoConexao({ nomeInstancia: this.instancia })
        : await this.cliente.obterEstadoInstancia(this.instancia);
      const state = typeof estadoBruto === "string" ? estadoBruto : estadoBruto?.state;
      if (state === "open") {
        this._definirEstado(ESTADOS_PROVEDOR.CONECTADO, `Instância ${this.instancia} conectada (open)`);
      } else {
        this._definirEstado(ESTADOS_PROVEDOR.AGUARDANDO_QR, `Instância ${this.instancia} aguardando conexão/QR`);
      }
    } catch (erro) {
      this._definirEstado(ESTADOS_PROVEDOR.ERRO, `Falha de conexão com Evolution: ${erro.message}`);
      log.alerta(`[EvolutionProvider] Não foi possível verificar estado inicial: ${erro.message}`);
    }
  }

  async parar() {
    this._definirEstado(ESTADOS_PROVEDOR.DESLIGADO, "Provedor Evolution desligado");
  }

  async enviarTexto(telefoneOuJid, texto, opcoes = {}) {
    try {
      const resposta = await this.cliente.enviarTexto({
        nomeInstancia: this.instancia,
        numero: telefoneOuJid,
        texto,
        quoted: opcoes?.quoted || null,
      });
      return { ok: true, idMensagem: resposta?.keyId || resposta?.key?.id || null };
    } catch (erro) {
      log.erro(`[EvolutionProvider] Erro ao enviar mensagem para ${telefoneOuJid}: ${erro.message}`);
      return { ok: false, erro: erro.message };
    }
  }

  /**
   * Chamado quando o webhook recebe notificação de mensagem.
   */
  notificarMensagemRecebida(msg) {
    this._emitirMensagem(msg);
  }

  /**
   * Chamado quando o webhook recebe atualização de estado ou QR Code.
   */
  notificarEstado(estado, qr = null) {
    if (qr) {
      this._emitirQr(qr);
    } else if (estado === "open" || estado === "conectado") {
      this._definirEstado(ESTADOS_PROVEDOR.CONECTADO, "Instância conectada");
    } else if (estado === "connecting" || estado === "reconectando") {
      this._definirEstado(ESTADOS_PROVEDOR.RECONECTANDO, "Reconectando instância");
    } else if (estado === "close" || estado === "desconectado") {
      this._definirEstado(ESTADOS_PROVEDOR.DESLIGADO, "Instância fechada");
    }
  }
}
