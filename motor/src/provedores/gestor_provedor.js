import { EvolutionProvider } from "./evolution_provedor.js";
import { WhatsAppWebPlaywrightProvider } from "./whatsapp_web_playwright.js";
import { log } from "../log.js";

/*
  ============================================================================
  GESTOR MULTIPROVEDOR DE WHATSAPP
  
  Controla a criação e ciclo de vida do provedor ativo de WhatsApp,
  permitindo alternar de forma transparente entre:
  - evolution: Evolution API v2 (contêiner Docker / WSL)
  - whatsapp_web: WhatsApp Web automatizado via Playwright (local)
  ============================================================================
*/

let provedorInstanciado = null;

export function obterTipoProvedorConfigurado() {
  const tipo = (
    process.env.WHATSAPP_PROVEDOR ||
    process.env.VEZ_GATEWAY ||
    "evolution"
  ).toLowerCase().trim();

  if (tipo === "playwright" || tipo === "whatsapp_web" || tipo === "wwebjs") {
    return "whatsapp_web";
  }
  return "evolution";
}

/**
 * Cria ou retorna o provedor ativo configurado no ambiente.
 * 
 * @param {object} [opcoes]
 * @returns {import('./provedor_base.js').ProvedorWhatsAppBase}
 */
export function obterProvedorAtivo(opcoes = {}) {
  if (provedorInstanciado) {
    return provedorInstanciado;
  }

  const tipo = obterTipoProvedorConfigurado();

  if (tipo === "whatsapp_web") {
    log.destaque("Gateway de Mensageria: WhatsApp Web via Playwright (Chromium Nativo)");
    provedorInstanciado = new WhatsAppWebPlaywrightProvider({
      headless: opcoes.headless ?? (process.env.WHATSAPP_WEB_HEADLESS === "true"),
      diretorioSessao: opcoes.diretorioSessao,
    });
  } else {
    log.destaque("Gateway de Mensageria: Evolution API v2 (Docker/Remoto)");
    provedorInstanciado = new EvolutionProvider({
      serverUrl: opcoes.serverUrl || process.env.EVOLUTION_SERVER_URL,
      apiKey: opcoes.apiKey || process.env.EVOLUTION_API_KEY,
      instancia: opcoes.instancia || process.env.EVOLUTION_INSTANCIA,
    });
  }

  return provedorInstanciado;
}

/**
 * Reinicia e troca o provedor em tempo de execução (útil para testes).
 */
export async function trocarProvedorParaTestes(novoProvedor) {
  if (provedorInstanciado) {
    try {
      await provedorInstanciado.parar();
    } catch {}
  }
  provedorInstanciado = novoProvedor;
  return provedorInstanciado;
}

/**
 * Reseta o provedor singleton.
 */
export function resetarGestorProvedor() {
  provedorInstanciado = null;
}
