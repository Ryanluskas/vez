/*
  ============================================================================
  FRAMEWORK SPIN SELLING — CAPITALCRED
  Qualificação comercial estruturada por convênio e necessidade do cliente.

  S - Situação: Identificação do convênio e banco atual
  P - Problema: Juros altos, parcela pesada, falta de fôlego no mês
  I - Implicação: Pagamento prolongado sem retorno, endividamento caro
  N - Necessidade de Solução: Redução de taxa, liberação de troco em conta
  ============================================================================
*/

export const CONVENIOS_SUPORTADOS = [
  "inss",
  "siape",
  "governo_estadual",
  "prefeitura",
  "forcas_armadas",
];

export const OBJETIVOS_CLIENTE = {
  TROCO: "troco", // Liberação de valor na conta sem aumentar a parcela
  REDUZIR_PARCELA: "reduzir_parcela", // Diminuir a prestação mensal
  NOVO_CONSIGNADO: "novo_consignado", // Uso de margem livre disponível
  QUITAR_DIVIDA: "quitar_divida", // Quitar dívidas caras (cartão/cheque)
};

export function diagnosticarNecessidade(texto) {
  if (!texto || typeof texto !== "string") return null;

  const t = texto.toLowerCase();

  if (/diminuir\s+(?:a\s+)?parcela|baixar\s+(?:a\s+)?parcela|sobrar\s+mais|alivi|pesad[oa]/i.test(t)) {
    return {
      objetivo: OBJETIVOS_CLIENTE.REDUZIR_PARCELA,
      focoComercial: "Redução da taxa de juros para diminuir o valor descontado no contracheque.",
    };
  }

  if (/liberar\s+valor|pegar\s+dinheiro|troco|dinheiro\s+na\s+conta|preciso\s+de\s+grana|urgente/i.test(t)) {
    return {
      objetivo: OBJETIVOS_CLIENTE.TROCO,
      focoComercial: "Portabilidade com troco: transfere a dívida para taxa menor e recebe a diferença em conta.",
    };
  }

  if (/quitar\s+(?:o\s+)?cart[aã]o|limpar\s+nome|d[ií]vida\s+alta|juros\s+do\s+cart[aã]o/i.test(t)) {
    return {
      objetivo: OBJETIVOS_CLIENTE.QUITAR_DIVIDA,
      focoComercial: "Substituir dívida cara por crédito consignado com taxa regulamentada mais baixa.",
    };
  }

  return null;
}

export function proximaPerguntaSpin({ memoria = {} }) {
  // 1. Falta saber o convênio (Situação básica)
  if (!memoria.convenio) {
    return {
      fase: "situacao",
      pergunta: "Você é aposentado do INSS, pensionista ou servidor público?",
      campoFaltante: "convenio",
    };
  }

  // 2. Falta saber o banco onde está o contrato (Situação operacional)
  if (!memoria.banco) {
    return {
      fase: "situacao",
      pergunta: "Em qual banco está o seu empréstimo atualmente?",
      campoFaltante: "banco",
    };
  }

  // 3. Falta saber o objetivo central (Problema / Necessidade)
  if (!memoria.objetivo) {
    return {
      fase: "necessidade",
      pergunta: "O que seria melhor pra você hoje: liberar um valor em conta ou diminuir a parcela do mês?",
      campoFaltante: "objetivo",
    };
  }

  return null;
}
