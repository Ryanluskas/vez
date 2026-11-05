/*
  ============================================================================
  EXTRATOR DE DADOS CADASTRAIS, FUNCIONAIS E BANCÁRIOS — CAPITALCRED
  Extrai do texto OCR de cada documento os campos necessários para montar
  o Texto Correntista Santander com precisão determinística.
  ============================================================================
*/

export function extrairCpf(texto) {
  if (!texto) return null;
  const match = texto.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
  return match ? match[1].replace(/\D/g, "") : null;
}

export function formatarCpf(cpf) {
  const limpo = String(cpf || "").replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;
  return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`;
}

export function extrairRg(texto) {
  if (!texto) return { numero: null, orgao: null, uf: null };
  const match = texto.match(/\b(?:rg|identidade|c[eé]dula)[\s:]*([0-9A-Za-z.-]{5,15})(?:\s*([A-Za-z]{3,6})\/?([A-Za-z]{2}))?/i);
  if (match) {
    return {
      numero: match[1].replace(/[^\w]/g, ""),
      orgao: match[2]?.toUpperCase() || "SSP",
      uf: match[3]?.toUpperCase() || null,
    };
  }
  return { numero: null, orgao: null, uf: null };
}

export function extrairDataNascimento(texto) {
  if (!texto) return null;
  const match = texto.match(/(?:data\s+(?:de\s+)?nasc(?:imento)?|nasc\.?)[\s:]*(\d{2}[/.-]\d{2}[/.-]\d{4})/i);
  return match ? match[1].replace(/[.-]/g, "/") : null;
}

export function extrairFiliacao(texto) {
  if (!texto) return { mae: null, pai: null };
  const matchMae = texto.match(/(?:m[aã]e|filia[cç][aã]o(?:\s*materna)?)[\s:]*([A-Z\s]{5,50})/i);
  const matchPai = texto.match(/(?:pai|filia[cç][aã]o(?:\s*paterna)?)[\s:]*([A-Z\s]{5,50})/i);

  return {
    mae: matchMae ? matchMae[1].trim() : null,
    pai: matchPai ? matchPai[1].trim() : null,
  };
}

export function extrairCep(texto) {
  if (!texto) return null;
  const match = texto.match(/\b(\d{5}-?\d{3})\b/);
  return match ? match[1].replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2") : null;
}

export function extrairDadosBancarios(texto) {
  if (!texto) return { banco: "033 - Santander", agencia: null, conta: null, tipoConta: "Corrente", pix: null };
  const matchAgencia = texto.match(/(?:ag[eê]ncia|ag\.?)[\s:]*(\d{3,5})/i);
  const matchConta = texto.match(/(?:conta(?:\s*corrente)?|c\/c|cc)[\s:]*(\d{4,12}-?\d?)/i);
  const matchPix = texto.match(/(?:pix|chave\s*pix)[\s:]*([^\s,;]+)/i);

  return {
    banco: "033 - Banco Santander (Brasil) S.A.",
    agencia: matchAgencia ? matchAgencia[1].trim() : null,
    conta: matchConta ? matchConta[1].trim() : null,
    tipoConta: "Corrente",
    pix: matchPix ? matchPix[1].trim() : null,
  };
}

export function extrairDadosDossie({ documentos = [] } = {}) {
  const consolidado = {
    nome: null,
    cpf: null,
    rg: null,
    orgaoEmissor: null,
    ufRg: null,
    dataNascimento: null,
    mae: null,
    pai: null,
    naturalidade: null,
    ufNaturalidade: null,
    matricula: null,
    orgao: null,
    endereco: {
      logradouro: null,
      bairro: null,
      cidade: null,
      uf: null,
      cep: null,
    },
    bancario: {
      banco: "033 - Banco Santander",
      agencia: null,
      conta: null,
      tipoConta: "Corrente",
      pix: null,
    },
    evidencias: [],
  };

  for (const doc of documentos) {
    const texto = doc.texto || "";
    if (!texto) continue;

    // CPF
    const cpf = extrairCpf(texto);
    if (cpf && !consolidado.cpf) {
      consolidado.cpf = formatarCpf(cpf);
      consolidado.evidencias.push({ campo: "cpf", valor: consolidado.cpf, documento: doc.tipo });
    }

    // RG
    const rgInfo = extrairRg(texto);
    if (rgInfo.numero && !consolidado.rg) {
      consolidado.rg = rgInfo.numero;
      consolidado.orgaoEmissor = rgInfo.orgao;
      consolidado.ufRg = rgInfo.uf;
      consolidado.evidencias.push({ campo: "rg", valor: rgInfo.numero, documento: doc.tipo });
    }

    // Data de Nascimento
    const dataNasc = extrairDataNascimento(texto);
    if (dataNasc && !consolidado.dataNascimento) {
      consolidado.dataNascimento = dataNasc;
      consolidado.evidencias.push({ campo: "dataNascimento", valor: dataNasc, documento: doc.tipo });
    }

    // Filiação
    const filiacao = extrairFiliacao(texto);
    if (filiacao.mae && !consolidado.mae) consolidado.mae = filiacao.mae;
    if (filiacao.pai && !consolidado.pai) consolidado.pai = filiacao.pai;

    // CEP
    const cep = extrairCep(texto);
    if (cep && !consolidado.endereco.cep) {
      consolidado.endereco.cep = cep;
      consolidado.evidencias.push({ campo: "cep", valor: cep, documento: doc.tipo });
    }

    // Dados Bancários
    const bancoInfo = extrairDadosBancarios(texto);
    if (bancoInfo.agencia && !consolidado.bancario.agencia) consolidado.bancario.agencia = bancoInfo.agencia;
    if (bancoInfo.conta && !consolidado.bancario.conta) consolidado.bancario.conta = bancoInfo.conta;
    if (bancoInfo.pix && !consolidado.bancario.pix) consolidado.bancario.pix = bancoInfo.pix;
  }

  return consolidado;
}
