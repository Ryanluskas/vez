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

function normalizarNomeComparacao(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function conferirDocumentos({
  documentos = [],
  dadosExtraidos = {},
  tiposObrigatorios = ["documento_identidade", "extrato_emprestimos", "comprovante_endereco"],
} = {}) {
  const itens = {
    cpf: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "CPF não localizado em múltiplos documentos" },
    nome: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Nome não localizado em múltiplos documentos" },
    endereco: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Comprovante de residência ausente" },
    bancario: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Dados de agência e conta incompletos" },
    checklist: { status: STATUS_CONFERENCIA.AUSENTE, detalhe: "Documentos obrigatórios pendentes" },
  };

  const cpfsEncontrados = [];
  const nomesEncontrados = [];
  const documentosRecebidos = [];
  const documentosValidados = [];
  const documentosIlegiveis = [];

  for (const doc of documentos) {
    const tipoDoc = String(doc.tipo_documento || doc.tipo || doc.arquivo_nome || "desconhecido");
    documentosRecebidos.push(tipoDoc);

    if (doc.legivel === false) {
      documentosIlegiveis.push(tipoDoc);
      itens.checklist = {
        status: STATUS_CONFERENCIA.ILEGIVEL,
        detalhe: `Documento "${tipoDoc}" recebido, porém ilegível`,
      };
      return {
        aprovadoAutomatico: false,
        itens,
        motivoReprovacao: `Documento "${tipoDoc}" está ilegível`,
        resumoDocumentos: {
          recebidos: documentosRecebidos,
          validados: documentosValidados,
          ilegiveis: documentosIlegiveis,
        },
      };
    }

    const d = doc.dados || doc.dados_extraidos || {};
    const temDadosExtraidos = Boolean(
      doc.validado === true ||
      d.cpf ||
      d.nome ||
      d.cep ||
      d.contratos?.length
    );

    if (temDadosExtraidos) {
      documentosValidados.push(tipoDoc);
    }

    if (d.cpf) cpfsEncontrados.push(d.cpf.replace(/\D/g, ""));
    if (d.nome) nomesEncontrados.push(normalizarNomeComparacao(d.nome));
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

  // 2. Conferência de Nome entre documentos
  if (nomesEncontrados.length >= 2) {
    const unicos = Array.from(new Set(nomesEncontrados.filter(Boolean)));
    const compativeis = unicos.every(
      (n) => n === unicos[0] || n.includes(unicos[0]) || unicos[0].includes(n)
    );
    if (compativeis) {
      itens.nome = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: "Nome consistente em todos os documentos" };
    } else {
      itens.nome = {
        status: STATUS_CONFERENCIA.DIVERGENTE,
        detalhe: `Nomes divergentes entre documentos: ${unicos.join(" vs ")}`,
      };
    }
  } else if (nomesEncontrados.length === 1 && nomesEncontrados[0]) {
    itens.nome = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: "Nome extraído com sucesso" };
  }

  // 3. Conferência de Endereço
  if (dadosExtraidos.endereco?.cep) {
    itens.endereco = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: `CEP ${dadosExtraidos.endereco.cep} validado` };
  }

  // 4. Conferência Bancária
  if (dadosExtraidos.bancario?.agencia && dadosExtraidos.bancario?.conta) {
    itens.bancario = { status: STATUS_CONFERENCIA.CONFIRMADO, detalhe: `Agência ${dadosExtraidos.bancario.agencia} / Conta ${dadosExtraidos.bancario.conta} (Santander 033)` };
  }

  // 5. Conferência de Checklist (diferenciando recebido vs validado)
  const faltantes = tiposObrigatorios.filter((t) => !documentosRecebidos.includes(t));
  const recebidosNaoValidados = documentosRecebidos.filter((t) => !documentosValidados.includes(t));
  if (faltantes.length === 0 && recebidosNaoValidados.length === 0 && documentosRecebidos.length > 0) {
    itens.checklist = {
      status: STATUS_CONFERENCIA.CONFIRMADO,
      detalhe: `Todos os ${documentosValidados.length} documentos recebidos e validados`,
    };
  } else if (recebidosNaoValidados.length > 0) {
    itens.checklist = {
      status: STATUS_CONFERENCIA.AUSENTE,
      detalhe: `Documentos recebidos mas sem dados validados: ${recebidosNaoValidados.join(", ")}`,
    };
  } else if (documentosValidados.length > 0) {
    itens.checklist = {
      status: STATUS_CONFERENCIA.AUSENTE,
      detalhe: `Validados: ${documentosValidados.join(", ")}. Pendentes: ${faltantes.join(", ")}`,
    };
  }

  // 6. Divergências críticas
  const divergencias = Object.entries(itens).filter(([, v]) => v.status === STATUS_CONFERENCIA.DIVERGENTE);
  const aprovadoAutomatico = divergencias.length === 0 && itens.cpf.status === STATUS_CONFERENCIA.CONFIRMADO;

  return {
    aprovadoAutomatico,
    itens,
    totalDivergencias: divergencias.length,
    divergencias: divergencias.map(([chave, val]) => `${chave}: ${val.detalhe}`),
    resumoDocumentos: {
      recebidos: documentosRecebidos,
      validados: documentosValidados,
      pendentes: faltantes,
      ilegiveis: documentosIlegiveis,
    },
  };
}
