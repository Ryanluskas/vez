import crypto from "node:crypto";

/*
  ============================================================================
  IDENTIFICADOR ÚNICO DA OPERAÇÃO DE PAGAMENTO
  Formato: VEZ-2026-XXXXXX (Ex: VEZ-2026-000154)
  ============================================================================
*/

export function gerarCodigoOperacao({ prefixo = "VEZ", ano = new Date().getFullYear(), sequencial = null } = {}) {
  const seq = sequencial !== null
    ? String(sequencial).padStart(6, "0")
    : String(crypto.randomInt(1000, 999999)).padStart(6, "0");

  return `${prefixo}-${ano}-${seq}`;
}

export function validarCodigoOperacao(codigo) {
  if (!codigo || typeof codigo !== "string") return false;
  return /^VEZ-\d{4}-\d{6}$/.test(codigo.trim());
}
