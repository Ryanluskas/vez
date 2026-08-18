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

import { valorConfiavel } from "./valores.js";

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
  /*
    "Você JÁ me disse o valor" — afirmação, não pergunta.

    Vem antes de "simulacao" porque é mais específico, e leva a uma
    resposta diferente: ele não está pedindo o número, está dizendo que já
    recebeu. Se eu tenho o número, repito. Se não tenho, ele tem razão e
    quem errou fui eu — a resposta certa começa admitindo isso, não
    perguntando "qual valor?".
  */
  [
    "valor_ja_dito",
    /\b(?:voce|vc)\s+ja\s+(?:me\s+)?(?:disse|falou|passou|mandou|informou)\b|\bja\s+(?:tinha\s+)?(?:me\s+)?(?:dito|falado|passado)\s+(?:o\s+)?valor\b/,
  ],
  [
    "simulacao",
    /\b(?:aquele|esse|este|o)\s+valor\b|\bvalor\s+(?:que|da simula)|(?:me\s+)?(?:disse|falou|passou|mandou)\s+(?:o\s+)?valor\b|\ba\s+simula[cç][aã]o\b|\baquela\s+simula|^\s*aquele\s*[.!?]*$/,
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

  if (alvo === "simulacao" || alvo === "valor_ja_dito") {
    /*
      A pergunta não é "existe número?" — é "existe número de fonte que eu
      possa citar?". Número de procedência desconhecida conta como
      ausência: ele não sai daqui pro cliente.
    */
    const confiavel = valorConfiavel(memoria);

    if (confiavel.tem) {
      return { alvo, tenho: true, simulacao: confiavel.simulacao, de: confiavel.de };
    }

    return {
      alvo,
      tenho: false,
      porque: confiavel.porque,
      /*
        NÃO inventa e NÃO repergunta.

        As duas saídas dizem a mesma coisa de jeitos diferentes: vou
        confirmar. A de "valor_ja_dito" começa dando razão a ele, porque
        ele tem — se eu deveria ter o número e não tenho, o furo é meu.
      */
      precisoConfirmar: alvo === "valor_ja_dito" ? "ele diz que eu já passei" : "qual simulação",
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
/*
  ============================================================================
  O QUE DIZER QUANDO NÃO SE TEM O NÚMERO

  Isto era uma pergunta e virou uma afirmação, e a mudança é de regra de
  negócio, não de estilo.

  O agente perguntava "você fala do que eu te passei antes, certo?". Do
  lado do cliente, isso é a mesma coisa que ele já tinha ouvido: alguém
  pedindo que ele repita o que já disse. Ele acabou de afirmar que o valor
  já foi informado — devolver uma pergunta confirma que ninguém anotou.

  A resposta certa não pergunta nada. Ela reconhece e assume o próximo
  passo: vou confirmar. Isso é verdade (a Fila ou a ferramenta vão
  atrás), não promete número, e não devolve o trabalho pro cliente.

  E quando ele diz "você JÁ me disse", começa dando razão a ele. Se o
  valor deveria estar aqui e não está, quem falhou não foi ele.

  SOBRE A FRASE QUE NÃO PÔDE SER USADA

  A frase pedida foi "Você tem razão. Vou confirmar esse valor aqui pra
  não te passar errado." O guarda de dinheiro recusa: ela contém a palavra
  "valor". Está certo em recusar — ele não distingue "vou confirmar esse
  valor" de "esse valor é R$ 4.200", e a exceção que deixasse a primeira
  passar deixaria a segunda também.

  Tirar a palavra custa nada e a frase diz exatamente o mesmo.
  ============================================================================
*/
const SEM_O_DADO = {
  /*
    Ele cobra o número e eu não tenho de fonte nenhuma. Não pergunto qual
    — assumo que vou atrás.
  */
  "qual simulação": "Deixa eu confirmar isso aqui certinho e já te retorno.",

  /*
    Ele afirma que eu já passei. Se eu tivesse, teria repetido; como não
    tenho, ele tem razão sobre a conversa e eu é que perdi o fio.
  */
  "ele diz que eu já passei": "Você tem razão. Vou confirmar aqui pra não te passar errado.",

  "qual contrato": "Você fala do contrato que a gente conversou, né? Só pra eu confirmar aqui.",
  "qual documento": "Qual deles você mandou? Não achei aqui, me desculpa.",

  /*
    Ele diz que já informou e o estado está vazio. Pedir pra ele repetir é
    o pior desfecho possível: é exatamente a reclamação dele.
  */
  "o que ele já informou": "Você tem razão. Deixa eu conferir aqui e já te falo.",
};

/*
  A frase pra quando a referência não resolve. Nome antigo era
  `perguntaQueAmarra`, e mudou porque a maioria destas já não pergunta
  nada — chamar de "pergunta" escondia justamente a correção.
*/
export function comoResponderSemTer(referencia) {
  if (!referencia || referencia.tenho) return null;
  return SEM_O_DADO[referencia.precisoConfirmar] ?? null;
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
