import EventEmitter from "node:events";

/*
  ============================================================================
  INTERFACE / CONTRATO COMUM DE PROVEDORES DE WHATSAPP
  
  Define a interface abstrata para provedores de mensageria (Evolution API,
  WhatsApp Web via Playwright, etc.), isolando completamente o motor de
  atendimento e as regras de IA de detalhes específicos de transporte.
  ============================================================================
*/

export const ESTADOS_PROVEDOR = {
  DESLIGADO: "desligado",
  INICIANDO: "iniciando",
  AGUARDANDO_QR: "aguardando_qr",
  CONECTADO: "conectado",
  RECONECTANDO: "reconectando",
  ERRO: "erro",
};

export const EVENTOS_PROVEDOR = {
  ESTADO_MUDOU: "estado_mudou",
  QR_RECEBIDO: "qr_recebido",
  MENSAGEM_RECEBIDA: "mensagem_recebida",
  ERRO: "erro",
};

export class ProvedorWhatsAppBase extends EventEmitter {
  constructor(nome = "ProvedorBase") {
    super();
    this.nome = nome;
    this.estado = ESTADOS_PROVEDOR.DESLIGADO;
    this.detalheEstado = "";
  }

  /**
   * Inicializa o provedor e estabelece conexão com o WhatsApp.
   * Deve ser sobrescrito pelas implementações filhas.
   * @returns {Promise<void>}
   */
  async iniciar() {
    throw new Error(`Método iniciar() não implementado no provedor ${this.nome}`);
  }

  /**
   * Encerra a conexão e libera recursos (browser, socket, etc.).
   * Deve ser sobrescrito pelas implementações filhas.
   * @returns {Promise<void>}
   */
  async parar() {
    throw new Error(`Método parar() não implementado no provedor ${this.nome}`);
  }

  /**
   * Envia uma mensagem de texto para um destinatário.
   * @param {string} telefoneOuJid - Número normalizado ou JID do contato
   * @param {string} texto - Conteúdo textual da mensagem
   * @param {object} [opcoes] - Opções adicionais (delay, citações, metadados)
   * @returns {Promise<{ ok: boolean, idMensagem?: string, erro?: string }>}
   */
  async enviarTexto(telefoneOuJid, texto, opcoes = {}) {
    throw new Error(`Método enviarTexto() não implementado no provedor ${this.nome}`);
  }

  /**
   * Retorna o estado atual da conexão.
   * @returns {{ estado: string, detalhe: string, conectado: boolean }}
   */
  obterEstado() {
    return {
      provedor: this.nome,
      estado: this.estado,
      detalhe: this.detalheEstado,
      conectado: this.estado === ESTADOS_PROVEDOR.CONECTADO,
    };
  }

  /**
   * Atualiza o estado interno e emite o evento correspondente.
   * @protected
   */
  _definirEstado(novoEstado, detalhe = "") {
    const mudou = this.estado !== novoEstado || this.detalheEstado !== detalhe;
    this.estado = novoEstado;
    this.detalheEstado = detalhe;
    if (mudou) {
      this.emit(EVENTOS_PROVEDOR.ESTADO_MUDOU, {
        provedor: this.nome,
        estado: novoEstado,
        detalhe,
      });
    }
  }

  /**
   * Emite evento de QR code para a UI / painel.
   * @protected
   */
  _emitirQr(qrString) {
    this._definirEstado(ESTADOS_PROVEDOR.AGUARDANDO_QR, "Aguardando leitura do QR Code");
    this.emit(EVENTOS_PROVEDOR.QR_RECEBIDO, qrString);
  }

  /**
   * Emite evento de mensagem recebida para o motor de atendimento.
   * @protected
   */
  _emitirMensagem(mensagemNormalizada) {
    this.emit(EVENTOS_PROVEDOR.MENSAGEM_RECEBIDA, mensagemNormalizada);
  }
}
