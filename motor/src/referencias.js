/*
  ============================================================================
  "AQUELE VALOR", "VOCÊ JÁ ME DISSE", "JÁ MANDEI"

  Uma conversa comercial é cheia de ponteiro para trás. O cliente não repete
  o assunto a cada mensagem — ele diz "aquele valor" e espera que a pessoa
  do outro lado saiba do que se trata.

  O bot não sabia. Cada mensagem chegava como se fosse a primeira:

    BOT:     Oi Ademar, vi que seu contrato Santander tem margem…
    CLIENTE: Preciso saber se ainda libera pra mim
    BOT:     Você é aposentado do INSS ou servidor? Em qual banco…

  Ele perguntou o banco que ele mesmo tinha acabado de citar. Do lado do
  cliente isso não é "faltou um dado" — é não ter ninguém prestando atenção.

  POR QUE ISSO É CÓDIGO E NÃO PROMPT

  "Aquele valor" é reconhecimento de padrão, não interpretação. E a resposta
  não pode depender do modelo por um motivo mais duro: quem diz o que já é
  conhecido tem que ser o ESTADO, não a IA. Modelo perguntado "você já sabe
  o banco dele?" responde o que soar plausível.

  O modelo interpreta a frase. O estado responde o que existe. São coisas
  diferentes e ficam em lugares diferentes.
  ============================================================================
*/

function simplificar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* ------------------------------------------------------------------
   O que a frase está apontando
------------------------------------------------------------------ */

/*
  Cada padrão aponta para uma coisa que o bot pode já ter. A ordem importa:
  "você já me disse o valor" é mais específico que "você já me disse".
*/
const APONTAM_PARA = [
  /* O número da simulação. */
  [
    "simulacao",
    /\b(?:aquele|esse|este|o)\s+valor\b|\bvalor\s+(?:que|da simula)|(?:me\s+)?(?:disse|falou|passou|mandou)\s+(?:o\s+)?valor\b|\ba\s+simula[cç][aã]o\b|\baquela\s+simula/,
  ],
  /* O contrato de que se falou. */
  [
    "contrato",
    /\b(?:aquele|esse|este|o)\s+contrato\b|\bcontrato\s+que\s+(?:voce|vc)\s+(?:falou|disse|citou)/,
  ],
  /* Documento que ele afirma ter enviado. */
  [
    "documento_enviado",
    /\bj[aá]\s+(?:te\s+)?(?:mandei|enviei|passei|maindei)\b|\bmandei\s+(?:isso|tudo|ja)\b|\bacabei de (?:mandar|enviar)\b/,
  ],
  /* Ele afirma que a informação já foi dada. */
  [
    "ja_informado",
    /\bvoc[eê]\s+(?:ja\s+)?(?:sabe|tem)\b|\bj[aá]\s+(?:te\s+)?(?:disse|falei|informei|passei)\b|\bcomo\s+(?:eu\s+)?(?:te\s+)?falei\b|\bvoc[eê]\s+(?:me\s+)?(?:disse|falou)\s+(?:antes|isso)\b|\beu\s+j[aá]\s+(?:disse|falei)\b/,
  ],
  /* Ele contesta ter sido perguntado. */
  [
    "contesta_pedido",
    /\b(?:mas\s+)?voc[eê]\s+(?:nem|nao|n[aã]o)\s+(?:pediu|perguntou|falou)\b|\bpor\s*qu[eê]\?*\s*$|\bmas\s+por\s*qu[eê]/,
  ],
];

/*
  Devolve o que a mensagem está referenciando, ou null.

  Null não é falha: é "esta mensagem não aponta pra trás", e aí o fluxo
  normal vale.
*/
export function oQueEstaReferenciando(mensagem) {
  const t = simplificar(mensagem);
  if (!t) return null;

  for (const [alvo, padrao] of APONTAM_PARA) {
    if (padrao.test(t)) return alvo;
  }
  return null;
}

/* ------------------------------------------------------------------
   O estado responde
------------------------------------------------------------------ */

/*
  A pergunta que o agente tem que fazer ANTES de perguntar qualquer coisa
  ao cliente: eu já sei isso?

  Quem responde é o estado persistido, nunca o modelo. `resolver` devolve
  uma das três situações, e cada uma leva a um caminho diferente:

    { tenho: true,  ... }   o dado existe — usa
    { tenho: false, precisoConfirmar }  entendi a referência mas não tenho
                                        o dado; pergunto SÓ isso
    null                    a mensagem não referenciava nada
*/
export function resolver(mensagem, memoria) {
  const alvo = oQueEstaReferenciando(mensagem);
  if (!alvo) return null;

  if (alvo === "simulacao") {
    const s = memoria?.simulacao ?? {};
    const temNumero = !!(s.valor || s.parcela || s.taxa);

    return temNumero
      ? { alvo, tenho: true, simulacao: s, de: s.de ?? null }
      : {
          alvo,
          tenho: false,
          /*
            NÃO inventa. A pergunta é só pra amarrar a referência — e é uma
            pergunta, não um número.
          */
          precisoConfirmar: "qual simulação",
        };
  }

  if (alvo === "contrato") {
    return memoria?.banco
      ? { alvo, tenho: true, banco: memoria.banco }
      : { alvo, tenho: false, precisoConfirmar: "qual contrato" };
  }

  if (alvo === "documento_enviado") {
    const entregues = Object.entries(memoria?.coletado ?? {})
      .filter(([, v]) => v?.confirmado)
      .map(([k]) => k);

    return entregues.length
      ? { alvo, tenho: true, entregues }
      : { alvo, tenho: false, precisoConfirmar: "qual documento" };
  }

  if (alvo === "ja_informado" || alvo === "contesta_pedido") {
    /*
      Ele diz que já informou, ou que nunca foi perguntado. Nos dois casos a
      resposta certa começa em olhar o que se tem — e o que se tem pode
      muito bem dar razão a ele.
    */
    const sei = oQueJaSei(memoria);
    return {
      alvo,
      tenho: sei.length > 0,
      jaSei: sei,
      precisoConfirmar: sei.length ? null : "o que ele já informou",
    };
  }

  return null;
}

/*
  Tudo que o estado já tem sobre este cliente, em forma de lista.

  É isto que o agente consulta antes de abrir a boca. Note que não há
  nenhuma chamada de modelo aqui: a resposta a "eu já sei isso?" é uma
  leitura, não uma opinião.
*/
export function oQueJaSei(memoria) {
  if (!memoria) return [];

  const sei = [];
  if (memoria.nome) sei.push({ campo: "nome", valor: memoria.nome });
  if (memoria.convenio) sei.push({ campo: "convenio", valor: memoria.convenio });
  if (memoria.banco) sei.push({ campo: "banco", valor: memoria.banco });
  if (memoria.objetivo) sei.push({ campo: "objetivo", valor: memoria.objetivo });

  for (const [chave, v] of Object.entries(memoria.coletado ?? {})) {
    if (v?.confirmado) sei.push({ campo: chave, valor: "recebido" });
  }

  const s = memoria.simulacao ?? {};
  if (s.valor || s.parcela || s.taxa) {
    sei.push({ campo: "simulacao", valor: "já passada", de: s.de });
  }

  return sei;
}

/* ------------------------------------------------------------------
   A frase que amarra a referência
------------------------------------------------------------------ */

/*
  Quando a referência não resolve, o bot pergunta UMA coisa: qual é o
  referente. Não recomeça a investigação.

  Estas frases não têm número e não prometem nada — o guarda de saída
  confere isso de qualquer forma.
*/
const PERGUNTAS = {
  /*
    Duas palavras não cabem aqui: "valor" e "simulação". As duas versões
    anteriores usaram uma delas e o guarda recusou as duas — corretamente,
    porque ele não sabe distinguir "a simulação que te passei" de "faço uma
    simulação pra você".

    Reescrever é mais barato que abrir exceção. A pergunta continua fazendo
    o trabalho: amarrar a referência sem prometer nada.
  */
  "qual simulação":
    "Você fala do que eu te passei antes, certo? Deixa eu conferir aqui e já te confirmo.",
  "qual contrato": "Você fala do contrato que a gente conversou, né? Só pra eu confirmar aqui.",
  "qual documento": "Qual deles você mandou? Não achei aqui, me desculpa.",
  "o que ele já informou": "Me ajuda a lembrar: o que você já tinha me passado?",
};

export function perguntaQueAmarra(referencia) {
  if (!referencia || referencia.tenho) return null;
  return PERGUNTAS[referencia.precisoConfirmar] ?? null;
}

/* ------------------------------------------------------------------
   O que NÃO perguntar de novo
------------------------------------------------------------------ */

/*
  Filtra do pedido tudo que o estado já tem.

  `montarPedido` em requisitos.js já pula o que está em `coletado` e nas
  colunas próprias. Isto é a rede embaixo: se por qualquer caminho um
  requisito conhecido entrar no pedido, ele sai aqui.

  Existe porque repetir pergunta é o erro mais caro do produto — mais caro
  que ficar sem responder, porque destrói a confiança em vez de só adiar.
*/
export function tirarOQueJaSei(pedido, memoria) {
  if (!pedido?.chaves?.length) return pedido;

  const conhecidas = new Set(oQueJaSei(memoria).map((s) => s.campo));
  const restantes = pedido.chaves.filter((c) => !conhecidas.has(c));

  if (restantes.length === pedido.chaves.length) return pedido;
  if (restantes.length === 0) return null;

  return { ...pedido, chaves: restantes, filtrado: true };
}
