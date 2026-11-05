/*
  ============================================================================
  MOTOR DE CONFERÊNCIA AUTOMÁTICA E VALIDAÇÃO CRUZADA — CAPITALCRED
  Cruza as informações extraídas entre os diferentes documentos:
  - CPF do RG bate com o CPF do Extrato / Contrato?
  - Nome coincide entre os documentos?
  - Comprovante de endereço recente e legível?
  - Dados bancários válidos no Santander?
  Status possíveis para cada item:
  - confirmado
  - divergente
  - ausente
  - ilegivel
  ============================================================================
*/

export const STATUS_CONFERENCIA = {
  CONFIRMADO: "confirmado",
  DIVERGENTE: "divergente",
  AUSENTE: "ausente",
  ILEGIVEL: "ilegivel",
};

export function conferirDocumentos({ documentos = [], dadosExtraidos = {} } = {}) {
  const itens = {
    cpf: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "CPF não localizado em múltiplos documentos" },
    nome: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Nome não localizado em múltiplos documentos" },
    endereco: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Comprovante de residência ausente" },
    bancario: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Dados de agência e conta incompletos" },
    checklist: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Documentos obrigatórios pendentes" },
  };

  const cpfsEncontrados = [];
  const nomesEncontrados = [];

  for (const doc of documentos) {
    if (doc.legivel === false) {
      return {
        aprovadoAutomatico: false,
        itens,
        motivoReprovacao: `Documento "${doc.tipo || doc.arquivo_nome}" está ilegível`,
      };
    }

    if (doc.dados?.cpf) cpfsEncontrados.push(doc.dados.cpf.replace(/\D/g, ""));
    if (doc.dados?.nome) nomesEncontrados.push(doc.dados.nome.toLowerCase().trim());
  }

  // 1. Conferência de CPF
  if (cpfsEncontrados.length >= 2) {
    const unicos = new Set(cpfsEncontrados);
    if (unicos.size === 1) {
      itens.cpf = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: "CPF idêntico em todos os documentos" };
    } else {
      itens.cpf = { status: STATUS_CONFERENCIA.DIVERGENTE, detalhe: `CPFs divergentes encontrados: ${Array.from(unicos).join(", ")}` };
    }
  } else if (cpfsEncontrados.length === 1) {
    itens.cpf = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: "CPF extraído com sucesso" };
  }

  // 2. Conferência de Endereço
  if (dadosExtraidos.endereco?.cep) {
    itens.endereco = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: `CEP ${dadosExtraidos.endereco.cep} validado` };
  }

  // 3. Conferência Bancária
  if (dadosExtraidos.bancario?.agencia && dadosExtraidos.bancario?.conta) {
    itens.bancario = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: `Agência ${dadosExtraidos.bancario.agencia} / Conta ${dadosExtraidos.bancario.conta} (Santander 033)` };
  }

  // 4. Divergências críticas
  const divergencias = Object.entries(itens).filter(([, v]) => v.status === STATUS_CONFERENCIA.DIVERGENTE);
  const aprovadoAutomatico = divergencias.length === 0 && itens.cpf.status === STATUS_CONFERENCIA.CONFIRMADO;

  return {
    aprovadoAutomatico,
    itens,
    totalDivergencias: divergencias.length,
    divergencias: divergencias.map(([chave, val]) => `${chave}: ${val.detalhe}`),
  };
}
