/*
  ============================================================================
  PLAYBOOK DE CONTORNO DE OBJEÇÕES — CAPITALCRED
  Técnicas de Persuasão Aplicadas a Refinanciamento de Consignado:
  1. Ancoragem e Contraste (Taxa de 2,x% -> 1,40% a.m.)
  2. Ressignificação do Atrito (Prazo 120 meses como chave de liberação)
  3. Alternativa Ilusória (Fechamento com escolha forçada para documentos)
  4. Honestidade Radical (Transparência no prazo e proteção antigolpe)
  5. Isolamento de Objeção ("Vou pensar" / "Falar com a família")
  ============================================================================
*/

export const TIPOS_OBJECAO = {
  OPT_OUT_EXPLICITO: "opt_out_explicito",
  NAO_TEM_INTERESSE: "nao_tem_interesse",
  RECUSA_OFERTA: "recusa_oferta",
  GOLPE_SEGURANCA: "golpe_seguranca",
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
    tipo: TIPOS_OBJECAO.RECUSA_OFERTA,
    regex: /\b(?:taxa\s+(?:muito\s+)?alta|juros\s+alto|valor\s+(?:muito\s+)?baixo|parcela\s+(?:muito\s+)?cara|muito\s+tempo|prazo\s+longo|n[aã]o\s+gostei\s+da\s+proposta|voltar\s+(?:pra|para)\s+120|n[aã]o\s+quero\s+(?:voltar\s+(?:pra|para)\s+)?120(?:\s*meses)?|120\s+meses\s+[eé]\s+muito)\b/i,
    estrategia: "Ressignificação do prazo e contraste de taxa. O prazo de 120 meses é a condição necessária para que a parcela não suba um centavo e o saldo seja liberado em conta.",
    diretriz: 'Ressignifique o prazo de 120 meses como a chave que viabiliza o valor sem aumentar a parcela nem um centavo. Use a frase: "É trocar uma dívida cara por uma mais barata e ainda embolsar a diferença".',
  },
  {
    tipo: TIPOS_OBJECAO.NAO_TEM_INTERESSE,
    regex: /\b(?:n[aã]o\s+tenho\s+interesse|n[aã]o\s+quero(?:\s+agora)?|sem\s+interesse|agora\s+n[aã]o|deixa\s+pra\s+depois|n[aã]o\s+preciso|n[aã]o\s+quero\s+ver)\b/i,
    estrategia: "Contorno persuasivo de desinteresse inicial. Não desista na primeira negativa: mostre a ancoragem do lucro do banco e parcela inalterada. Se o cliente insistir no não, pare para não perder tempo.",
    diretriz: "Aplique persuasão imediata: 'Entendo perfeitamente! Só queria te mostrar porque hoje o banco tá ganhando muito em cima de você com essa taxa de 2,x%. A gente derruba pra 1,40% pra esse lucro voltar pro seu bolso agora, sem subir um centavo na parcela. Quer dar uma olhada sem compromisso?'. Se ele insistir que não quer, encerre na hora para não perder tempo.",
  },
  {
    tipo: TIPOS_OBJECAO.OPT_OUT_EXPLICITO,
    regex: /\b(?:pare\s+de\s+(?:me\s+)?mandar|n[aã]o\s+me\s+mande\s+mais|n[aã]o\s+me\s+chame\s+mais|remover?\s+(?:o\s+)?(?:meu\s+)?(?:n[uú]mero|contato)|descadastrar?|excluir?\s+(?:meus\s+dados|meu\s+n[uú]mero|meu\s+contato)|apagar?\s+meu\s+n[uú]mero|tirar\s+meu\s+n[uú]mero|sair\s+da\s+lista|bloquear\s+contatos?|opt[\s-]?out)\b/i,
    estrategia: "Conformidade LGPD estrita. Bloqueio imediato de novos disparos promocionais. Zero ofertas adicionais.",
    diretriz: "Confirme o cancelamento com objetividade e respeito: 'Tudo bem, não te chamo mais. Obrigado pelo retorno!'",
  },
  {
    tipo: TIPOS_OBJECAO.GOLPE_SEGURANCA,
    regex: /\b(?:golpe|seguro|fraude|confi[aá]vel|[eé]\s+verdade|voc[eê]s\s+s[aã]o\s+de\s+onde|qual\s+o\s+cnpj|onde\s+fica)\b/i,
    estrategia: "Honestidade Radical e Autoridade. Validação da cautela do cliente, apresentação do CNPJ 53.093.082/0001-22 e garantia de que nunca pede senhas ou códigos.",
    diretriz: "Valide a desconfiança ('É bom desconfiar mesmo'). Forneça o CNPJ oficial e reforce que a assinatura é feita diretamente pelo banco oficial com biometria facial.",
  },
  {
    tipo: TIPOS_OBJECAO.NAO_ENVIA_DOCUMENTOS,
    regex: /\b(?:n[aã]o\s+(?:vou\s+)?mandar\s+(?:foto|documento)|medo\s+de\s+mandar\s+documento|n[aã]o\s+passo\s+documento|por\s+que\s+precisa\s+do\s+documento)\b/i,
    estrategia: "Alternativa Ilusória e Segurança. Explicar que o documento é exigência do banco para averbação antifraude e oferecer opções de envio.",
    diretriz: "Pergunte com alternativa: 'Prefere me enviar a foto do RG agora ou prefere que eu te chame mais tarde/às 14h para tirar com calma?'",
  },
  {
    tipo: TIPOS_OBJECAO.VOU_PENSAR,
    regex: /\b(?:vou\s+pensar|deixa\s+eu\s+ver|depois\s+eu\s+vejo|vou\s+analisar|vou\s+dar\s+uma\s+pensada|preciso\s+pensar)\b/i,
    estrategia: "Isolamento de Objeção. Identificar se a hesitação é sobre os números (valor, prazo, taxa) ou tempo de reflexão.",
    diretriz: 'Isole a objeção antes de aceitar o adiamento: pergunte "Tirando isso, existe algo nos números (valor, prazo ou taxa) que não te agradou?". Só aceite o "vou pensar" após isolar a dúvida técnica.',
  },
  {
    tipo: TIPOS_OBJECAO.JA_TEM_CONSULTOR,
    regex: /\b(?:j[aá]\s+tenho\s+(?:um\s+)?(?:consultor|gerente|banco|onde\s+fa[çc]o)|fa[çc]o\s+sempre\s+com\s+o\s+mesmo)\b/i,
    estrategia: "Respeito à relação e benchmarking. Comparação da taxa de 1,40% a.m. sem compromisso.",
    diretriz: "Parabenize pela confiança no parceiro atual e ofereça apenas comparar a taxa de 1,40% para ver se o banco dele cobre.",
  },
  {
    tipo: TIPOS_OBJECAO.CONVERSAR_FAMILIA,
    regex: /\b(?:falar|conversar|ver)\s+com\s+(?:minha\s+)?(?:esposa|marido|fam[ií]lia|filh[oa])\b/i,
    estrategia: "Apoio e Isolamento. Validar que decisão de casa é sagrada e oferecer um resumo curto (valor, parcela e prazo) para conversarem.",
    diretriz: 'Diga: "Claro! Mas me diga uma coisa: tirando a conversa com ela, os números (valor e taxa) ficaram bons para você? Se sim, te mando um resumo para facilitar a explicação para ela."',
  },
  {
    tipo: TIPOS_OBJECAO.ACORDO_FECHAMENTO,
    regex: /\b(?:pode\s+(?:fazer|seguir|mandar|dar\s+andamento)|fechado|vamos\s+fazer|vamos\s+seguir|concordo|quero\s+sim|aceito|gostei(?:\s+da\s+proposta)?|pode\s+ser|t[aá]\s+bom|beleza\s+pode|vamos\s+nessa|pode\s+sim|quero\s+fazer|vamos\s+fechar|quero\s+fechar)\b/i,
    estrategia: "Fechamento por Alternativa Ilusória (escolha forçada para envio de documento).",
    diretriz: 'No momento de pedir documentos, apresente o checklist de 5 itens (documento com foto, comprovante de endereço, contracheque, extrato de margem e contratos Santander) e pergunte por alternativa ilusória: "Você prefere me mandar a foto do RG agora ou prefere que eu te chame daqui a pouco para tirar com calma?"',
  },
  {
    tipo: TIPOS_OBJECAO.CONFIRMACAO_DOCUMENTOS,
    regex: /\b(?:s[oó]\s+isso(?:\s+mesmo)?|apenas\s+isso|precisa\s+de\s+mais\s+alguma\s+coisa|mais\s+nada)\b/i,
    estrategia: "Confirmação objetiva dos 5 documentos e encorajamento para formalização.",
    diretriz: "Confirme com segurança: 'Isso mesmo! Com esses 5 documentos na mão a gente confere tudo e dá entrada na sua liberação no Santander.'",
  },
  {
    tipo: TIPOS_OBJECAO.NAO_ENTENDEU,
    regex: /\b(?:n[aã]o\s+entendi|como\s+(?:assim|funciona\s+isso)|explica\s+melhor|t[aá]\s+confuso)\b/i,
    estrategia: "Síntese em uma frase clara: parcela igual, taxa cai para 1,40% e a diferença cai na conta em dinheiro.",
    diretriz: "Explique em termos práticos: 'Sua parcela mensal continua rigorosamente igual, seus juros caem para 1,40% e você recebe um dinheiro na conta.'",
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
        estrategia: item.estrategia,
        diretriz: item.diretriz,
      };
    }
  }

  return null;
}
