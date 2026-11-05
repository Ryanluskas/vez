/*
  ============================================================================
  MÓDULO DE GOVERNANÇA DO PILOTO CONTROLADO — VEZ
  Garante que durante o piloto NENHUM número fora da allowlist receba
  mensagens automáticas, follow-ups ou disparos de robô.
  ============================================================================
*/

import { log } from "./log.js";

/**
 * Retorna a lista de telefones normalizados autorizados para o piloto.
 */
export function obterTelefonesAutorizados() {
  const raw = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((t) => t.trim().replace(/\D/g, ""))
    .filter((t) => t.length >= 8);
}

/**
 * Informa se o sistema está operando em modo de piloto controlado.
 */
export function estaEmModoPiloto() {
  const raw = process.env.PILOTO_TELEFONES_AUTORIZADOS;
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Valida se um número específico está autorizado a receber mensagens automáticas.
 *
 * @param {string} telefone - O número do contato (ex: "5511999998888").
 * @returns {boolean} True se autorizado, False se bloqueado.
 */
export function telefoneAutorizadoNoPiloto(telefone) {
  if (!estaEmModoPiloto()) {
    return true; // Sem restrição de piloto ativa
  }

  const autorizados = obterTelefonesAutorizados();
  if (autorizados.length === 0) {
    // Variável foi definida porém com valor inválido ou vazio:
    // Princípio do privilégio mínimo / fail-safe: BLOQUEIA disparos.
    return false;
  }

  const telLimpo = String(telefone || "").replace(/\D/g, "");
  if (!telLimpo || telLimpo.length < 8) return false;

  // Compara os últimos 8 dígitos para ser imune a variações de DDD, DDI (55) ou 9º dígito
  return autorizados.some((aut) => telLimpo.endsWith(aut.slice(-8)));
}

/**
 * Filtro utilitário para interceptação de mensagens recebidas no motor.
 */
export function verificarBloqueioPiloto(telefone, contexto = "atendimento") {
  if (!estaEmModoPiloto()) return { bloqueado: false };

  const autorizado = telefoneAutorizadoNoPiloto(telefone);
  if (!autorizado) {
    log.info(`[Piloto Controlado] Ação de ${contexto} bloqueada para ${telefone}: contato fora da allowlist.`);
    return {
      bloqueado: true,
      motivo: "Telefone não consta em PILOTO_TELEFONES_AUTORIZADOS (fora da allowlist)",
    };
  }

  return { bloqueado: false };
}
