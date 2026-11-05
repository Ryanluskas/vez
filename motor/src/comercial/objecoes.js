/*
  ============================================================================
  CLASSIFICADOR E GUIA DE TRATAMENTO DE OBJEÇÕES — CAPITALCRED
  Diretrizes consultivas, naturais e transparentes:
  1. Distinção estrita entre reclamação grave/acusação de golpe (handoff imediato)
     e dúvida objetiva de segurança (resposta informativa sem pressão).
  2. Respeito imediato a recusas de documentos ou desinteresse.
  3. Zero promessas universais de taxa/parcela sem simulação verificada.
  4. Zero escolhas forçadas ou escassez artificial.
  ============================================================================
*/

export const TIPOS_OBJECAO = {
  OPT_OUT_EXPLICITO: "opt_out_explicito",
  RECLAMACAO_GRAVE: "reclamacao_grave",
  AMEACA_DENUNCIA: "ameaca_denuncia",
  NAO_TEM_INTERESSE: "nao_tem_interesse",
  RECUSA_OFERTA: "recusa_oferta",
  GOLPE_SEGURANCA: "golpe_seguranca",
  DUVIDA_SEGURANCA: "duvida_seguranca",
  NAO_ENVIA_DOCUMENTOS: "nao_envia_documentos",
  VOU_PENSAR: "vou_pensar",
  JA_TEM_CONSULTOR: "ja_tem_consultor",
  CONVERSAR_FAMILIA: "conversar_familia",
  NAO_ENTENDEU: "nao_entendeu",
  ACORDO_FECHAMENTO: "acordo_fechamento",
  CONFIRMACAO_DOCUMENTOS: "confirmacao_documentos",
};

export const PADROES_OBJECAO = [
  {
    tipo: TIPOS_OBJECAO.OPT_OUT_EXPLICITO,
    gravidade: "critica",
    exigeHandoffHumano: false,
    regex: /\b(?:pare\s+de\s+(?:me\s+)?mandar|n[aã]o\s+me\s+mande\s+mais|n[aã]o\s+me\s+chame\s+mais|remover?\s+(?:o\s+)?(?:meu\s+)?(?:n[uú]mero|contato)|descadastrar?|excluir?\s+(?:meus\s+dados|meu\s+n[uú]mero|meu\s+contato)|apagar?\s+meu\s+n[uú]mero|tirar\s+meu\s+n[uú]mero|sair\s+da\s+lista|bloquear\s+contatos?|opt[\s-]?out)\b/i,
    estrategia: "Conformidade LGPD estrita. Bloqueio imediato de novos disparos promocionais. Zero ofertas adicionais.",
    diretriz: "Confirme o descadastramento com objetividade e respeito, sem tentar reverter.",
  },
  {
    tipo: TIPOS_OBJECAO.AMEACA_DENUNCIA,
    gravidade: "critica",
    exigeHandoffHumano: true,
    regex: /\b(?:denunciar|den[uú]ncia|pol[ií]cia|delegacia|boletim\s+de\s+ocorr[eê]ncia|fazer\s+(?:um\s+)?b\.?o\.?|procon|banco\s+central|bacen|processar|advogado|justi[cç]a)\b/i,
    estrategia: "Interrupção imediata da abordagem comercial, redução total de pressão e escalonamento para responsável humano.",
    diretriz: "Reconheça a gravidade sem discutir, informe que o atendimento automático está sendo encerrado e transfira imediatamente para o responsável humano.",
  },
  {
    tipo: TIPOS_OBJECAO.RECLAMACAO_GRAVE,
    gravidade: "critica",
    exigeHandoffHumano: true,
    regex: /\b(?:voc[eê]s\s+d[aã]o\s+golpes?|puro\s+golpe|s[aã]o\s+golpistas?|tentativa\s+de\s+golpe|fraude|estelionato|n[aã]o\s+confio\s+em\s+voc[eê]s|empresa\s+falsa|mentira\s+de\s+voc[eê]s)\b/i,
    estrategia: "Desarme imediato de pressão comercial. Nunca responder acusação de golpe com pitch de vendas. Escalonar ao humano.",
    diretriz: "Valide a cautela do cliente com calma, não tente vender nem pedir documentos, e encaminhe a conversa para revisão humana.",
  },
  {
    tipo: TIPOS_OBJECAO.GOLPE_SEGURANCA,
    gravidade: "moderada",
    exigeHandoffHumano: false,
    regex: /\b(?:isso\s+[eé]\s+(?:um\s+)?golpe|qual\s+(?:[eé]\s+)?o\s+cnpj|voc[eê]s\s+s[aã]o\s+de\s+onde|onde\s+fica\s+a\s+empresa|[eé]\s+seguro\s+mesmo|como\s+sei\s+que\s+[eé]\s+seguro|tenho\s+medo\s+de\s+golpe|como\s+funciona\s+a\s+seguran[cç]a)\b/i,
    estrategia: "Transparência verificável sem pressão comercial. Informar CNPJ oficial quando perguntado e explicar que nunca pedimos senhas ou valores adiantados.",
    diretriz: "Responda de forma curta e verificável que nunca cobramos taxas antecipadas, nunca pedimos senhas e a formalização ocorre apenas no canal oficial do banco.",
  },
  {
    tipo: TIPOS_OBJECAO.NAO_ENVIA_DOCUMENTOS,
    gravidade: "alta",
    exigeHandoffHumano: false,
    regex: /\b(?:n[aã]o\s+(?:vou|quero)\s+(?:te\s+)?(?:mandar|enviar|passar)\s+(?:foto|documento|extrato|contracheque|rg|cnh|nada)|medo\s+de\s+mandar\s+documento|n[aã]o\s+passo\s+documento|n[aã]o\s+mando\s+(?:documento|extrato|foto)|por\s+que\s+precisa\s+do\s+documento)\b/i,
    estrategia: "Respeito imediato à recusa documental. Explicar brevemente o motivo sem insistir no envio e oferecer auxílio humano.",
    diretriz: "Respeite a recusa imediatamente, nunca repita o pedido do documento recusado e ofereça tirar dúvidas ou passar para o consultor.",
  },
  {
    tipo: TIPOS_OBJECAO.RECUSA_OFERTA,
    gravidade: "moderada",
    exigeHandoffHumano: false,
    regex: /\b(?:taxa\s+(?:muito\s+)?alta|juros\s+alto|valor\s+(?:muito\s+)?baixo|parcela\s+(?:muito\s+)?cara|muito\s+tempo|prazo\s+longo|n[aã]o\s+gostei\s+da\s+proposta|voltar\s+(?:pra|para)\s+120|n[aã]o\s+quero\s+(?:voltar\s+(?:pra|para)\s+)?120(?:\s*meses)?|120\s+meses\s+[eé]\s+muito)\b/i,
    estrategia: "Escuta consultiva sobre a condição da proposta, oferecendo verificar alternativas com o consultor sem prometer números não verificados.",
    diretriz: "Reconheça o ponto do cliente com transparência e pergunte se ele quer que o consultor verifique outra configuração possível ou prefere encerrar.",
  },
  {
    tipo: TIPOS_OBJECAO.NAO_TEM_INTERESSE,
    gravidade: "moderada",
    exigeHandoffHumano: false,
    regex: /\b(?:n[aã]o\s+tenho\s+interesse|n[aã]o\s+quero(?:\s+agora|\s+mesmo|\s+obrigad[oa])?|sem\s+interesse|agora\s+n[aã]o|deixa\s+pra\s+depois|n[aã]o\s+preciso|n[aã]o\s+quero\s+ver)\b/i,
    estrategia: "Respeito à decisão do cliente. Sem insistência agressiva ou promessas de taxas sem simulação.",
    diretriz: "Acolha a resposta com educação e pergunte de forma leve se prefere encerrar por aqui, encerrando imediatamente caso ele confirme.",
  },
  {
    tipo: TIPOS_OBJECAO.VOU_PENSAR,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:vou\s+pensar|deixa\s+eu\s+ver|depois\s+eu\s+vejo|vou\s+analisar|vou\s+dar\s+uma\s+pensada|preciso\s+pensar)\b/i,
    estrategia: "Respeitar o tempo de decisão do cliente e colocar-se à disposição para esclarecer dúvidas.",
    diretriz: "Respeite o tempo de reflexão sem criar urgência artificial e pergunte apenas se ficou alguma dúvida que possa esclarecer.",
  },
  {
    tipo: TIPOS_OBJECAO.JA_TEM_CONSULTOR,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:j[aá]\s+tenho\s+(?:um\s+)?(?:consultor|gerente|banco|onde\s+fa[çc]o)|fa[çc]o\s+sempre\s+com\s+o\s+mesmo)\b/i,
    estrategia: "Respeito ao relacionamento atual do cliente, deixando o canal aberto sem pressão.",
    diretriz: "Valorize o fato de ele já ter alguém de confiança e deixe o canal aberto caso queira comparar condições no futuro.",
  },
  {
    tipo: TIPOS_OBJECAO.CONVERSAR_FAMILIA,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:falar|conversar|ver|consultar)\s+com\s+(?:a\s+|o\s+)?(?:minha\s+|meu\s+)?(?:esposa|marido|fam[ií]lia|filh[oa]|mulher)\b/i,
    estrategia: "Apoiar a decisão em família sem pressionar pelo fechamento imediato e sem mudar de assunto.",
    diretriz: "Valide a conversa com a família com naturalidade e ofereça deixar um resumo simples para avaliarem juntos com calma.",
  },
  {
    tipo: TIPOS_OBJECAO.ACORDO_FECHAMENTO,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:pode\s+(?:fazer|seguir|mandar|dar\s+andamento)|fechado|vamos\s+fazer|vamos\s+seguir|concordo|quero\s+sim|aceito|gostei(?:\s+da\s+proposta)?|pode\s+ser|t[aá]\s+bom|beleza\s+pode|vamos\s+nessa|pode\s+sim|quero\s+fazer|vamos\s+fechar|quero\s+fechar)\b/i,
    estrategia: "Condução organizada da etapa de documentação, pedindo um item por vez de forma clara e sem escolha forçada.",
    diretriz: "Confirme o andamento e solicite apenas o próximo documento pendente de forma simples e direta.",
  },
  {
    tipo: TIPOS_OBJECAO.CONFIRMACAO_DOCUMENTOS,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:s[oó]\s+isso(?:\s+mesmo)?|apenas\s+isso|precisa\s+de\s+mais\s+alguma\s+coisa|mais\s+nada)\b/i,
    estrategia: "Confirmação clara do andamento da conferência documental.",
    diretriz: "Confirme com tranquilidade que com a documentação conferida a proposta segue para análise e formalização no banco.",
  },
  {
    tipo: TIPOS_OBJECAO.NAO_ENTENDEU,
    gravidade: "baixa",
    exigeHandoffHumano: false,
    regex: /\b(?:n[aã]o\s+entendi|como\s+(?:assim|funciona\s+isso)|explica\s+melhor|t[aá]\s+confuso)\b/i,
    estrategia: "Explicação simples em uma ou duas frases sobre a revisão de condições do contrato, sem prometer taxas ou valores não simulados.",
    diretriz: "Explique de forma curta e clara o que está sendo verificado no contrato dele, sem inventar números.",
  },
];

export function identificarAcordoFechamento(texto) {
  if (!texto || typeof texto !== "string") return false;
  return /\b(?:pode\s+(?:fazer|seguir|mandar|dar\s+andamento)|fechado|vamos\s+fazer|vamos\s+seguir|concordo|quero\s+sim|aceito|gostei(?:\s+da\s+proposta)?|pode\s+ser|beleza\s+pode|vamos\s+nessa|pode\s+sim|quero\s+fazer|vamos\s+fechar)\b/i.test(texto);
}

export function identificarObjecao(texto) {
  if (!texto || typeof texto !== "string") return null;

  for (const item of PADROES_OBJECAO) {
    if (item.regex.test(texto)) {
      return {
        tipo: item.tipo,
        gravidade: item.gravidade || "moderada",
        exigeHandoffHumano: Boolean(item.exigeHandoffHumano),
        estrategia: item.estrategia,
        diretriz: item.diretriz,
      };
    }
  }

  return null;
}
