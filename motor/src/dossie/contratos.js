import { comoNumero, comoDinheiro } from "../lista.js";

/*
  ============================================================================
  EXTRATOR E CONTADOR DE CONTRATOS REFINANCIADOS — CAPITALCRED
  Extrai e valida contratos individuais presentes no documento/extrato:
  - Número do contrato
  - Valor da parcela
  - Taxa original de juros
  - Parcelas pagas / totais
  - Saldo devedor
  ============================================================================
*/

export function extrairContratos(texto) {
  if (!texto || typeof texto !== "string") return [];

  const blocosBrutos = [];
  const linhas = texto.split(/\r?\n/);
  const regexContrato = /(?:contrato|n[oº]|proposta)[\s:]*([0-9A-Za-z*.-]{5,20})/i;
  const regexParcela = /(?:parcela|prestac[aã]o|vlr|valor(?!\s*quitac|\s*saldo))[\s:]*(?:r\$\s*)?([\d.,]+)/i;
  const regexTaxa = /(?:taxa|juros)[\s:]*([\d.,]+(?:\s*%\s*(?:a\.?m\.?|ao\s*m[eê]s)?)?)/i;
  const regexSaldo = /(?:saldo(?:\s*devedor)?|valor\s*quitac[aã]o)[\s:]*(?:r\$\s*)?([\d.,]+)/i;

  let bufferAtual = null;

  for (const linha of linhas) {
    const matchContrato = linha.match(regexContrato);
    if (matchContrato) {
      if (bufferAtual && bufferAtual.numero) {
        blocosBrutos.push({ ...bufferAtual });
      }
      bufferAtual = {
        numero: matchContrato[1].trim(),
        parcela: null,
        taxa: null,
        pagas: null,
        total: null,
        saldo: null,
      };
    }

    if (bufferAtual) {
      const matchSaldo = linha.match(regexSaldo);
      if (matchSaldo && !bufferAtual.saldo) {
        bufferAtual.saldo = comoNumero(matchSaldo[1]);
      }

      const matchParcela = !matchSaldo ? linha.match(regexParcela) : null;
      if (matchParcela && !bufferAtual.parcela) {
        bufferAtual.parcela = comoNumero(matchParcela[1]);
      }

      const matchTaxa = linha.match(regexTaxa);
      if (matchTaxa && !bufferAtual.taxa) {
        bufferAtual.taxa = matchTaxa[1].trim();
      }

      const matchPrazos = linha.match(/(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/);
      if (matchPrazos && !bufferAtual.total) {
        bufferAtual.pagas = Number(matchPrazos[1]);
        bufferAtual.total = Number(matchPrazos[2]);
      }
    }
  }

  if (bufferAtual && bufferAtual.numero) {
    blocosBrutos.push({ ...bufferAtual });
  }

  // Consolidação multi-página por número de contrato (mescla campos extraídos em páginas distintas)
  const porNumero = new Map();
  for (const b of blocosBrutos) {
    const existente = porNumero.get(b.numero);
    if (!existente) {
      porNumero.set(b.numero, { ...b });
    } else {
      if (!existente.parcela && b.parcela) existente.parcela = b.parcela;
      if (!existente.taxa && b.taxa) existente.taxa = b.taxa;
      if (existente.pagas == null && b.pagas != null) existente.pagas = b.pagas;
      if (!existente.total && b.total) existente.total = b.total;
      if (!existente.saldo && b.saldo) existente.saldo = b.saldo;
    }
  }

  return Array.from(porNumero.values()).map(normalizarContrato);
}

function normalizarContrato(c) {
  return {
    numero: c.numero,
    parcela: c.parcela || 0,
    parcelaFormatada: comoDinheiro(c.parcela),
    taxa: c.taxa || "Não informada",
    pagas: c.pagas || 0,
    total: c.total || 120,
    saldoDevedor: c.saldo || 0,
  };
}

export function consolidarContratos(contratos = []) {
  const totalContratos = contratos.length;
  const somaParcelas = contratos.reduce((acc, c) => acc + (Number(c.parcela) || 0), 0);
  const somaSaldo = contratos.reduce((acc, c) => acc + (Number(c.saldoDevedor) || 0), 0);

  return {
    totalContratos,
    somaParcelas: Number(somaParcelas.toFixed(2)),
    somaParcelasFormatada: comoDinheiro(somaParcelas),
    somaSaldo: Number(somaSaldo.toFixed(2)),
    somaSaldoFormatada: comoDinheiro(somaSaldo),
    contratos,
  };
}
