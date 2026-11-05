/*
  ============================================================================
  CAMADA ISOLADA DE SELETORES DO WHATSAPP WEB
  
  Centraliza seletores e estratégias de recuperação com múltiplos fallbacks
  para absorver variações de classes e atributos do WhatsApp Web oficial.
  Nunca use seletores espalhados no código de automação.
  ============================================================================
*/

export const SELETORES_WHATSAPP = {
  // QR Code de autenticação
  qrCode: [
    'canvas[aria-label*="Scan"]',
    'canvas[aria-label*="Escanear"]',
    'div[data-ref] canvas',
    'div[data-testid="qrcode"] canvas',
    'div[data-testid="qrcode"]',
    'div[role="button"][data-ref]',
    'canvas',
  ],

  // Indicador de sessão carregada e conectada
  appCarregado: [
    'div[data-testid="chat-list"]',
    'div#side',
    'div[aria-label="Lista de conversas"]',
    'div[aria-label="Chat list"]',
    'div[data-testid="intro-title"]',
    'div[data-testid="default-user"]',
  ],

  // Caixa de busca de conversas na barra lateral
  buscaConversa: [
    'div[data-testid="chat-list-search"]',
    'div[contenteditable="true"][data-tab="3"]',
    'div[aria-label="Caixa de texto de pesquisa"]',
    'div[aria-label="Search input text box"]',
  ],

  // Lista de conversas e cartões de chat
  cartaoChat: [
    'div[data-testid="cell-frame-container"]',
    'div[role="listitem"]',
    'div._ak72',
  ],

  // Painel de conversa aberta (área principal)
  painelConversa: [
    'div[data-testid="conversation-panel-wrapper"]',
    'div#main',
    'div[data-testid="conversation-panel-messages"]',
  ],

  // Campo de digitação de mensagem
  caixaMensagem: [
    'div[data-testid="conversation-compose-box-input"]',
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][title="Mensagem"]',
    'div[contenteditable="true"][title="Type a message"]',
    'footer div[contenteditable="true"]',
    'div[role="textbox"][data-tab="10"]',
  ],

  // Botão de envio
  botaoEnviar: [
    'button[data-testid="compose-btn-send"]',
    'span[data-icon="send"]',
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
  ],

  // Indicadores de desconexão e instabilidade de rede
  bannerDesconexao: [
    'div[data-testid="toast-disconnected"]',
    'div[data-testid="network-status-banner"]',
    'div[data-testid="alert-phone-not-connected"]',
    'span[data-icon="alert-phone"]',
  ],
};

/**
 * Tenta encontrar um elemento utilizando uma lista ordenada de seletores de fallback.
 * 
 * @param {import('playwright-core').Page} page
 * @param {string[]} seletores - Array de seletores candidatos
 * @param {object} [opcoes] - Opções de busca (timeout, state)
 * @returns {Promise<{ elemento: import('playwright-core').ElementHandle|null, seletorUsado: string|null }>}
 */
export async function tentarSeletores(page, seletores, opcoes = { timeout: 3000 }) {
  for (const seletor of seletores) {
    try {
      const el = await page.waitForSelector(seletor, {
        timeout: opcoes.timeout || 2000,
        state: opcoes.state || "visible",
      });
      if (el) {
        return { elemento: el, seletorUsado: seletor };
      }
    } catch {
      // Tenta o próximo seletor de fallback silenciosamente
    }
  }
  return { elemento: null, seletorUsado: null };
}
