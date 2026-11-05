/*
  ============================================================================
  QUALIFICADOR DE LEADS — FUNIL COMERCIAL CAPITALCRED
  Classifica a oportunidade em fria, morna, quente ou desqualificada
  com base em evidências verificadas na conversa.
  ============================================================================
*/

export function classificarTemperaturaLead({ conversa = {}, memoria = {}, ultimaMensagem = "" } = {}) {
  conversa = conversa || {};
  memoria = memoria || {};
  const texto = String(ultimaMensagem || "").toLowerCase();

  // 1. Desqualificado por opt-out LGPD ou atendimento desligado
  // Objeções comuns ("não quero", "sem interesse") NÃO desqualificam na hora: ativam contorno persuasivo!
  if (
    conversa.opt_out === true ||
    conversa.atender === false ||
    /\b(?:pare\s+de\s+(?:me\s+)?mandar|n[aã]o\s+me\s+mande\s+mais|n[aã]o\s+me\s+chame\s+mais|remover?\s+(?:o\s+)?(?:meu\s+)?(?:n[uú]mero|contato)|descadastrar?|excluir?\s+(?:meus\s+dados|meu\s+n[uú]mero)|apagar?\s+meu\s+n[uú]mero|tirar\s+meu\s+n[uú]mero|sair\s+da\s+lista|bloquear\s+contatos?|opt[\s-]?out)\b/i.test(texto)
  ) {
    return {
      qualificacao: "desqualificada",
      motivo: "Cliente solicitou opt-out LGPD explícito ou atendimento desativado.",
    };
  }

  // 2. Lead Quente: tem convênio + banco + objetivo, ou já mandou documentação / pediu formalização
  const temFatosPrincipais = Boolean(memoria.convenio && memoria.banco);
  const mandouDocs = Boolean(
    conversa.etapa === "documentos_recebidos" ||
    conversa.etapa === "em_analise" ||
    (memoria.documentos && Object.values(memoria.documentos).some(Boolean))
  );

  if (mandouDocs || (temFatosPrincipais && memoria.objetivo)) {
    return {
      qualificacao: "quente",
      motivo: mandouDocs
        ? "Documentação recebida para análise."
        : "Dados completos coletados (convênio, banco e objetivo).",
    };
  }

  // 3. Lead Morno: já respondeu e está interagindo (conversando)
  if (
    conversa.etapa === "conversando" ||
    memoria.convenio ||
    memoria.banco ||
    memoria.nome
  ) {
    return {
      qualificacao: "morna",
      motivo: "Interagindo com o consultor e preenchendo dados de qualificação.",
    };
  }

  // 4. Lead Frio: novo sem resposta ou sem avanço
  return {
    qualificacao: "fria",
    motivo: "Primeiro contato ou aguardando resposta inicial.",
  };
}
