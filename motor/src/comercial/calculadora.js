/**
 * ============================================================================
 * CALCULADORA FINANCEIRA DETERMINÍSTICA — CAPITALCRED & VEZ
 *
 * Módulo canônico para todos os cálculos financeiros da operação.
 * A Regra de Ouro da CapitalCred e do Vez proíbe terminantemente que modelos de
 * IA inventem, arredondem ou deduzam valores numéricos ou percentuais.
 *
 * REGRAS DE DISTRIBUIÇÃO DA REDUÇÃO CAPITALCRED:
 * - Redução Total >= R$ 8.000,00 -> Divisão 50% Cliente / 50% CapitalCred
 * - Redução Total <  R$ 8.000,00 -> Divisão 62% Cliente / 38% CapitalCred
 *
 * PRECISÃO:
 * - Operações com arredondamento monetário estrito de 2 casas decimais.
 * - Soma (cliente + empresa) é garantida como identicamente igual ao total.
 * - Rejeição total de valores nulos, negativos, não finitos ou absurdos.
 * ============================================================================
 */

export const CORTE_REDUCAO_CAPITALCRED = 8000.0;
export const TAXA_PADRAO_SANTANDER = "1,40% a.m.";
export const PRAZO_PADRAO_MESES = 120;

/**
 * Normaliza qualquer representação de valor numérico (string pt-BR, float, etc.)
 * para um número Number finito ou null se inválido.
 */
export function comoNumero(bruto) {
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
 * Seguro contra null, undefined, NaN ou tipos inválidos.
 */
export function comoDinheiro(n) {
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
 *
 * @param {number|string} valorReducao - O valor total da redução apurado.
 * @returns {object} Detalhamento completo e formatado do cálculo.
 */
export function calcularReducaoCapitalCred(valorReducao) {
  let cru = comoNumero(valorReducao);

  if (cru === null || !Number.isFinite(cru) || cru <= 0) {
    return {
      valido: false,
      valorTotal: 0,
      cliente: 0,
      empresa: 0,
      percentualCliente: 0,
      percentualEmpresa: 0,
      clienteFormatado: null,
      empresaFormatado: null,
      totalFormatado: null,
      regra: "Inválido (valor deve ser maior que zero)",
    };
  }

  // Normalização financeira para moeda (2 casas decimais estritas)
  cru = Math.round(cru * 100) / 100;

  // Regra de corte exata em R$ 8.000,00
  if (cru >= CORTE_REDUCAO_CAPITALCRED) {
    const cliente = Math.round(cru * 0.5 * 100) / 100;
    const empresa = Math.round((cru - cliente) * 100) / 100;
    return {
      valido: true,
      valorTotal: cru,
      cliente,
      empresa,
      percentualCliente: 50,
      percentualEmpresa: 50,
      clienteFormatado: comoDinheiro(cliente),
      empresaFormatado: comoDinheiro(empresa),
      totalFormatado: comoDinheiro(cru),
      regra: "50/50 (Redução a partir de R$ 8.000)",
    };
  }

  // Redução abaixo de R$ 8.000,00: 62% cliente / 38% empresa
  const cliente = Math.round(cru * 0.62 * 100) / 100;
  const empresa = Math.round((cru - cliente) * 100) / 100;
  return {
    valido: true,
    valorTotal: cru,
    cliente,
    empresa,
    percentualCliente: 62,
    percentualEmpresa: 38,
    clienteFormatado: comoDinheiro(cliente),
    empresaFormatado: comoDinheiro(empresa),
    totalFormatado: comoDinheiro(cru),
    regra: "62/38 (Redução abaixo de R$ 8.000)",
  };
}

/**
 * Monta a redação padronizada da proposta comercial para o WhatsApp
 */
export function montarTextoPropostaCapitalCred({
  nomeCliente = "",
  valorLiberadoFormatado,
  bancoAtual = "",
}) {
  const primeiroNome = nomeCliente ? nomeCliente.trim().split(/\s+/)[0] : "";
  const saudacao = primeiroNome ? `${primeiroNome}, ` : "";
  const bancoRef = bancoAtual ? ` do seu contrato no ${bancoAtual}` : "";

  return (
    `Consegui aprovar a redução${bancoRef} e libera exatamente ${valorLiberadoFormatado} ` +
    `para você agora na sua conta, mantendo a sua parcela sem aumento e a taxa em 1,40% ao mês pelo Santander.\n\n` +
    `Fica excelente para você darmos entrada agora?`
  );
}
