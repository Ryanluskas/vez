/*
  ============================================================================
  CLASSIFICADOR DOCUMENTAL INTELIGENTE — CAPITALCRED
  Categorias obrigatórias:
  1. contratos: contratos de empréstimo / detalhamento de parcelas
  2. extrato_margem: extrato de consignações / margem consignável (INSS / SouGov)
  3. contracheque: holerite / folha de pagamento / comprovante de rendimentos
  4. comprovante_endereco: conta de luz, água, gás, telefone, internet
  5. documento_foto: RG, CNH, carteira profissional com foto
  ============================================================================
*/

export const CATEGORIAS_DOCUMENTO = {
  CONTRATOS: "contratos",
  EXTRATO_MARGEM: "extrato_margem",
  CONTRACHEQUE: "contracheque",
  COMPROVANTE_ENDERECO: "comprovante_endereco",
  DOCUMENTO_FOTO: "documento_foto",
  NAO_IDENTIFICADO: "nao_identificado",
};

export const PADROES_CLASSIFICACAO = [
  {
    tipo: CATEGORIAS_DOCUMENTO.DOCUMENTO_FOTO,
    termos: [
      /\b(?:carteira\s+nacional\s+de\s+habilita[cç][aã]o|cnh|registro\s+geral|c[eé]dula\s+de\s+identidade|ssp\/\w{2}|filiacao|data\s+de\s+nascimento|orgao\s+emissor|doc\s*com\s*foto)\b/i,
      /\b(?:rg\b|naturalidade|nacionalidade|validade\s+em\s+todo\s+o\s+territorio\s+nacional)\b/i,
    ],
    nomesArquivos: [/\brg\b/i, /\bcnh\b/i, /\bidentidade\b/i, /\bdoc(?:umento)?[-_]?foto\b/i],
  },
  {
    tipo: CATEGORIAS_DOCUMENTO.EXTRATO_MARGEM,
    termos: [
      /\b(?:extrato\s+de\s+consigna[cç][oõ]es|extrato\s+de\s+margem|margem\s+consign[aá]vel|margem\s+livre|hiscon|resumo\s+de\s+consigna[cç][aã]o|portal\s+do\s+servidor|sougov)\b/i,
      /\b(?:inss\s+extrato|beneficio\s+n[oº]|margem\s+dispon[ií]vel)\b/i,
    ],
    nomesArquivos: [/\bmargem\b/i, /\bhiscon\b/i, /\bconsignac\w*\b/i, /\bextrato[-_]?consignado\b/i],
  },
  {
    tipo: CATEGORIAS_DOCUMENTO.CONTRACHEQUE,
    termos: [
      /\b(?:holerite|contracheque|comprovante\s+de\s+rendimentos|folha\s+de\s+pagamento|demonstrativo\s+de\s+pagamento|total\s+de\s+vencimentos|sal[aá]rio\s+base|total\s+descontos|l[ií]quido\s+a\s+receber)\b/i,
    ],
    nomesArquivos: [/\bholerite\b/i, /\bcontracheque\b/i, /\brendimentos\b/i, /\bfolha[-_]?pagamento\b/i],
  },
  {
    tipo: CATEGORIAS_DOCUMENTO.COMPROVANTE_ENDERECO,
    termos: [
      /\b(?:comprovante\s+de\s+resid[eê]ncia|conta\s+de\s+energia|conta\s+de\s+luz|conta\s+de\s+[aá]gua|conta\s+de\s+g[aá]s|fatura\s+de\s+telefone|fatura\s+internet|enel|equatorial|sabesp|cpfl|sanepar|copasa|claro|vivo|tim|oi\s+fibra|cep\s*\d{5}[-.]?\d{3})\b/i,
    ],
    nomesArquivos: [/\bcomprovante[-_]?(?:endereco|residencia)\b/i, /\bconta[-_]?(?:luz|energia|agua)\b/i, /\bfatura\b/i],
  },
  {
    tipo: CATEGORIAS_DOCUMENTO.CONTRATOS,
    termos: [
      /\b(?:c[eé]dula\s+de\s+cr[eé]dito\s+banc[aá]rio|ccb|contrato\s+de\s+empr[eé]stimo|quadro\s+demonstrativo|detalhamento\s+de\s+parcelas|saldo\s+devedor|valor\s+da\s+parcela|cet\s+anual|cet\s+mensal|parcelas\s+pagas|parcelas\s+restantes)\b/i,
      /\b(?:banco\s+santander|santander\s+financiamentos|contrato\s+n[oº]?\s*\d+)\b/i,
    ],
    nomesArquivos: [/\bcontrato\w*\b/i, /\bccb\b/i, /\bdetalhamento\b/i, /\bparcelas\b/i, /\brefin\b/i],
  },
];

export function classificarDocumento({ texto = "", nomeArquivo = "", mimetype = "" } = {}) {
  const textoLimpo = String(texto || "").trim();
  const nomeLimpo = String(nomeArquivo || "").trim();

  // 1. Tenta por correspondência de texto OCR extraído
  if (textoLimpo.length > 10) {
    for (const regra of PADROES_CLASSIFICACAO) {
      for (const termo of regra.termos) {
        if (termo.test(textoLimpo)) {
          return {
            tipo: regra.tipo,
            confianca: 0.95,
            criterio: "conteudo_texto",
          };
        }
      }
    }
  }

  // 2. Tenta por nome do arquivo
  if (nomeLimpo.length > 2) {
    for (const regra of PADROES_CLASSIFICACAO) {
      for (const padraoNome of regra.nomesArquivos) {
        if (padraoNome.test(nomeLimpo)) {
          return {
            tipo: regra.tipo,
            confianca: 0.8,
            criterio: "nome_arquivo",
          };
        }
      }
    }
  }

  return {
    tipo: CATEGORIAS_DOCUMENTO.NAO_IDENTIFICADO,
    confianca: 0.2,
    criterio: "indefinido",
  };
}

export function validarChecklistCompleto(checklist = {}) {
  const obrigatorios = [
    CATEGORIAS_DOCUMENTO.CONTRATOS,
    CATEGORIAS_DOCUMENTO.EXTRATO_MARGEM,
    CATEGORIAS_DOCUMENTO.CONTRACHEQUE,
    CATEGORIAS_DOCUMENTO.COMPROVANTE_ENDERECO,
    CATEGORIAS_DOCUMENTO.DOCUMENTO_FOTO,
  ];

  const pendentes = obrigatorios.filter((cat) => !checklist[cat]);
  return {
    completo: pendentes.length === 0,
    pendentes,
    totalRecebidos: obrigatorios.length - pendentes.length,
    totalObrigatorios: obrigatorios.length,
  };
}
