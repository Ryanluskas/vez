/**
 * ============================================================================
 * CALCULADORA FINANCEIRA CANÔNICA — CAPITALCRED & VEZ (PAINEL FRONTEND)
 *
 * Módulo determinístico para cálculos de redução financeira.
 * Espelha integralmente a lógica de motor/src/comercial/calculadora.js.
 *
 * REGRAS DE DISTRIBUIÇÃO DA REDUÇÃO CAPITALCRED:
 * - Redução Total >= R$ 8.000,00 -> Divisão 50% Cliente / 50% CapitalCred
 * - Redução Total <  R$ 8.000,00 -> Divisão 62% Cliente / 38% CapitalCred
 * ============================================================================
 */

export const CORTE_REDUCAO_CAPITALCRED = 8000.0;
export const TAXA_PADRAO_SANTANDER = "1,40% a.m.";
export const PRAZO_PADRAO_MESES = 120;

export interface ResultadoCalculoCapitalCred {
  valido: boolean;
  valorTotal: number;
  total: number;
  cliente: number;
  valorCliente: number;
  empresa: number;
  valorEmpresa: number;
  percentualCliente: number;
  percCliente: number;
  percentualEmpresa: number;
  percEmpresa: number;
  clienteFormatado: string | null;
  valorClienteFormatado: string | null;
  empresaFormatado: string | null;
  valorEmpresaFormatado: string | null;
  totalFormatado: string | null;
  regra: string;
}

/**
 * Normaliza qualquer representação de valor numérico (string pt-BR, float, etc.)
 * para um número Number finito ou null se inválido.
 */
export function comoNumero(bruto: unknown): number | null {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;

  const limpo = String(bruto)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formata um número para o padrão de moeda brasileiro: "R$ 1.150,94".
 */
export function comoDinheiro(n: number | null | undefined): string | null {
  if (n === null || n === undefined || typeof n !== "number" || !Number.isFinite(n)) {
    return null;
  }
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Calcula a divisão determinística da redução financeira entre Cliente e CapitalCred.
 */
export function calcularReducaoCapitalCred(
  valorReducao: unknown
): ResultadoCalculoCapitalCred | null {
  let cru = comoNumero(valorReducao);

  if (cru === null || !Number.isFinite(cru) || cru <= 0) {
    return null;
  }

  // Normalização monetária para 2 casas decimais estritas
  cru = Math.round(cru * 100) / 100;

  // Regra de corte exata em R$ 8.000,00
  if (cru >= CORTE_REDUCAO_CAPITALCRED) {
    const cliente = Math.round(cru * 0.5 * 100) / 100;
    const empresa = Math.round((cru - cliente) * 100) / 100;
    const clienteFormatado = comoDinheiro(cliente);
    const empresaFormatado = comoDinheiro(empresa);
    const totalFormatado = comoDinheiro(cru);

    return {
      valido: true,
      valorTotal: cru,
      total: cru,
      cliente,
      valorCliente: cliente,
      empresa,
      valorEmpresa: empresa,
      percentualCliente: 50,
      percCliente: 50,
      percentualEmpresa: 50,
      percEmpresa: 50,
      clienteFormatado,
      valorClienteFormatado: clienteFormatado,
      empresaFormatado,
      valorEmpresaFormatado: empresaFormatado,
      totalFormatado,
      regra: "50/50 (Redução a partir de R$ 8.000)",
    };
  }

  // Redução abaixo de R$ 8.000,00: 62% cliente / 38% empresa
  const cliente = Math.round(cru * 0.62 * 100) / 100;
  const empresa = Math.round((cru - cliente) * 100) / 100;
  const clienteFormatado = comoDinheiro(cliente);
  const empresaFormatado = comoDinheiro(empresa);
  const totalFormatado = comoDinheiro(cru);

  return {
    valido: true,
    valorTotal: cru,
    total: cru,
    cliente,
    valorCliente: cliente,
    empresa,
    valorEmpresa: empresa,
    percentualCliente: 62,
    percCliente: 62,
    percentualEmpresa: 38,
    percEmpresa: 38,
    clienteFormatado,
    valorClienteFormatado: clienteFormatado,
    empresaFormatado,
    valorEmpresaFormatado: empresaFormatado,
    totalFormatado,
    regra: "62/38 (Redução abaixo de R$ 8.000)",
  };
}
