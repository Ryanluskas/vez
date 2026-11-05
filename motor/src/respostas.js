import { REQUISITOS } from "./requisitos.js";
import { primeiroNome } from "./abordagem.js";
import { checarGatilhos } from "./gatilhos.js";

/*
  ============================================================================
  O QUE O BOT SABE RESPONDER SEM IA NENHUMA

  Classificar e gerar são coisas diferentes, e o código já resolve a primeira
  na maioria dos casos. Este arquivo resolve a segunda nos casos em que a
  resposta certa não depende de interpretar nada.

  POR QUE ISSO É SOBRE CONFIABILIDADE, NÃO SOBRE VELOCIDADE

  Medido: a geração falha. Ollama fora do ar, tempo estourado, modelo
  devolvendo texto que o validador recusa. Quando isso acontecia, a conversa
  ia pra Fila e o cliente ficava em SILÊNCIO até um humano aparecer — ele
  mandou "bom dia" e não recebeu nada.

  Uma saudação não precisa de modelo de linguagem. Um "recebi seu documento"
  também não. Escrever essas frases à mão custa nada e tira a parte mais
  frágil do caminho da parte mais comum do atendimento.

  A LINHA QUE NÃO SE CRUZA

  Nenhuma resposta aqui tem número, e nenhuma promete nada. Elas são
  cumprimento, confirmação e pedido — as três coisas que um consultor diz
  sem precisar consultar o sistema.

  Toda saída daqui passa pelo `checarGatilhos` antes de existir: se alguma
  frase que eu escrevi soar como dinheiro, ela não sai. Escrevi todas e
  ainda assim confiro — texto sofre edição, e a edição de amanhã não vai
  lembrar desta regra.
  ============================================================================
*/

/*
  Só o primeiro nome, sempre.

  O nome que chega até aqui é o do contato do WhatsApp, e vem inteiro:
  "Ademar Elleres". "Ademar Elleres, recebi seus documentos" não é como
  ninguém escreve pra alguém que conhece — é como um sistema escreve. E o
  produto inteiro depende do cliente achar que tem gente do outro lado.
*/
function comNome(nome, frase) {
  const curto = primeiroNome(nome);
  return curto ? `${curto}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
}

/* Varia pra não parecer robô repetindo a mesma linha o dia inteiro. */
function umaDelas(lista, semente = Date.now()) {
  return lista[Math.abs(semente) % lista.length];
}

/* ------------------------------------------------------------------
   Saudação
------------------------------------------------------------------ */

/*
  O nome entra DENTRO da saudação, não antes dela.

  "Ademar, oi! Tudo bem?" não é como ninguém escreve. "Oi Ademar! Tudo
  bem?" é. A vírgula-vocativa funciona pra afirmação ("Ademar, recebi seus
  documentos") e soa mecânica pro cumprimento — daí o {nome} no meio.

  E são DUAS frases, não três. "Oi! Tudo bem? Me conta o que você precisa."
  é uma abertura de atendente de call center: cumprimenta, pergunta como
  vai, e já emite o convite formal. Consultor manda "Oi Ademar! Tudo bem?"
  e espera — o cliente diz o que quer sem precisar ser convidado.
*/
const SAUDACOES = [
  "Oi{nome}! Tudo bem?",
  "Oi{nome}, tudo bom?",
  "Opa{nome}! Tudo certo?",
];

const AGRADECIMENTOS = [
  "Imagina{nome}! Qualquer coisa é só chamar.",
  "Por nada{nome}! Precisando, me chama.",
  "Tranquilo{nome}! Qualquer dúvida é só falar.",
];

const ELE_AGRADECEU = /\b(?:obrigad[oa]|vlw|valeu|agradec|show|ótimo|otimo|perfeito|legal|beleza|blz|ok|entendi|certo)\b/i;

export function saudacao(mensagemCliente, nomeCliente, semente) {
  const lista = ELE_AGRADECEU.test(mensagemCliente ?? "") ? AGRADECIMENTOS : SAUDACOES;
  const curto = primeiroNome(nomeCliente);
  return umaDelas(lista, semente).replace("{nome}", curto ? ` ${curto}` : "");
}

/* ------------------------------------------------------------------
   Documento recebido
------------------------------------------------------------------ */

/*
  Chegou arquivo. O consultor responde na hora, mesmo sem ter olhado —
  cliente que manda documento e não recebe nem um "recebi" acha que sumiu.
*/
export function documentoRecebido(nomeCliente, aindaFalta = []) {
  const falta = Array.isArray(aindaFalta) ? aindaFalta : [];

  if (falta.length === 0) {
    return comNome(
      nomeCliente,
      "Beleza, recebi aqui. Vou validar com o gerente agora e já te aviso."
    );
  }

  const nomes = falta.map((c) => REQUISITOS[c]?.rotulo ?? c);
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;

  return comNome(nomeCliente, `Recebi, obrigado! Ainda falta ${lista} pra eu conseguir seguir.`);
}

/* ------------------------------------------------------------------
   Informação recebida
------------------------------------------------------------------ */

const COMO_CHAMAR = {
  convenio: { inss: "aposentado/pensionista do INSS", servidor: "servidor público", militar: "militar" },
};

/*
  O cliente disse alguma coisa sobre ele e o bot guardou. Confirmar em voz
  alta é o que faz a memória VALER pro cliente: ele percebe que foi ouvido,
  e não repete a informação na mensagem seguinte.
*/
export function informacaoRecebida(fatos, nomeCliente) {
  const partes = [];

  if (fatos?.convenio) {
    partes.push(COMO_CHAMAR.convenio[fatos.convenio] ?? fatos.convenio);
  }
  if (fatos?.banco) partes.push(`com contrato no ${fatos.banco}`);

  if (partes.length === 0) return null;

  return comNome(nomeCliente, `Anotei aqui: ${partes.join(", ")}. Já ajuda bastante!`);
}

/* ------------------------------------------------------------------
   Pedido do que falta
------------------------------------------------------------------ */

/*
  O texto já vem montado de `requisitos.js`, que é código. Aqui só coloca o
  nome e a pontuação.

  Tinha um embrulho — "Pra eu conseguir te responder, X. Pode ser?" — e ele
  fazia duas coisas ruins. A primeira era visível: o pedido do convênio já
  termina em interrogação, então a frase saía "...servidor público?. Pode
  ser?", com a pontuação dobrada.

  A segunda era o embrulho em si. Consultor não justifica o pedido nem pede
  licença pra fazê-lo; ele pergunta. "Ademar, me manda seu contracheque
  atualizado." é a mensagem. O resto era enchimento que só fazia a frase
  passar de cem caracteres.
*/
export function pedirOQueFalta(pedido, nomeCliente) {
  const texto = pedido?.texto?.trim();
  if (!texto) return null;

  return comNome(nomeCliente, texto.endsWith("?") ? texto : `${texto}.`);
}

/* ------------------------------------------------------------------
   O aviso de que alguém vai olhar
------------------------------------------------------------------ */

/*
  A resposta mais importante do arquivo, e a mais simples.

  Quando nada pôde ser respondido — nem por IA, nem por regra — o caso vai
  pra Fila. Antes disso, o cliente recebia SILÊNCIO até o consultor abrir o
  painel. Ele mandou uma pergunta e não recebeu nem sinal de vida.

  Isto não responde a pergunta. Não promete valor, não promete prazo, não
  diz "vai dar certo". Só diz que a mensagem chegou e que alguém vai
  responder — que é exatamente o que é verdade.
*/
/*
  A ordem é FIXA e o índice é a CONTAGEM, não sorteio.

  Achado numa conversa real: o cliente recebeu "Vou dar uma olhada e te
  respondo em seguida." três vezes — 22:22, 22:23, 22:25 — e respondeu
  "Mas você só fala isso?". Ele estava certo.

  A causa era `umaDelas(lista, Date.now())`. Duas coisas erradas nisso.
  A pequena: `Date.now() % 3` colide sempre que o intervalo é múltiplo
  de 3ms, e um minuto (60000ms) é. A grande: mesmo com sorteio perfeito,
  uma em cada três repetiria — sorteio não garante variação, garante que
  às vezes varia.

  A contagem garante. E a terceira frase reconhece a espera em vez de
  fingir que é a primeira vez, porque na terceira já não é.

  Devolve null quando acabam. Isso NÃO é o cliente ficando no vácuo: ele
  já foi avisado três vezes e o caso já está na Fila. Um quarto aviso
  idêntico não informa nada — só prova que não tem ninguém lendo.
*/
const VOU_VERIFICAR = [
  "Vou confirmar isso certinho e já te retorno.",
  "Deixa eu conferir aqui e já te falo.",
  "Ainda estou confirmando isso, assim que eu tiver te falo.",
];

export function vouVerificar(nomeCliente, quantosAvisosJaMandei = 0) {
  const frase = VOU_VERIFICAR[quantosAvisosJaMandei];
  return frase ? comNome(nomeCliente, frase) : null;
}

/* Este texto é um dos meus avisos? Serve pra contar quantos já saíram. */
export function ehAvisoDeQueVaiVerificar(texto) {
  const t = String(texto ?? "").toLowerCase();
  return (
    VOU_VERIFICAR.some((frase) => t.includes(frase.toLowerCase())) ||
    t.includes("vou fazer uma simulação") ||
    t.includes("já te passo as condições") ||
    t.includes("vou confirmar isso") ||
    t.includes("já te retorno") ||
    t.includes("já te falo")
  );
}

/* ------------------------------------------------------------------
   "Mas você nem pediu isso"
------------------------------------------------------------------ */

/*
  Isto é correção, não pergunta.

  O bot pediu documento numa etapa em que documento não era o assunto, e o
  cliente reclamou — com razão. Repetir o pedido depois disso é a pior
  resposta possível: confirma que ninguém está lendo.

  Um consultor de verdade recua: "você tem razão, me adiantei". Recuar
  custa uma frase e salva a conversa; insistir custa o cliente.
*/
const ME_ADIANTEI = [
  "Você tem razão, me adiantei aqui. Vamos por partes.",
  "Verdade, me adiantei. Deixa eu voltar um passo.",
  "É justo, pulei uma etapa. Vamos com calma.",
];

export function meAdiantei(nomeCliente, semente) {
  return comNome(nomeCliente, umaDelas(ME_ADIANTEI, semente));
}

/* ------------------------------------------------------------------
   "Você já me disse" — e eu já disse mesmo
------------------------------------------------------------------ */

/*
  O número já foi pro cliente e ele volta a apontar pra ele.

  Repetir o texto inteiro é o que um sistema faz. Medido no teste do
  Ademar: ele disse "você já me disse o valor" e recebeu de volta,
  palavra por palavra, a mesma mensagem que tinha acabado de ler. A
  frase dele era literalmente "eu já sei isso" — e a resposta foi
  dizer de novo.

  Um consultor confirma e segue: "isso mesmo, é essa que te passei".
  Sem número, porque o número ele já tem; ele não está pedindo o dado,
  está checando que os dois estão falando da mesma coisa.
*/
const JA_TE_FALEI = [
  "Isso mesmo, é essa que te passei antes.",
  "Isso, é essa mesma. Quer que eu já dê entrada?",
];

/*
  A variante vem da CONTAGEM, não de sorteio.

  Era `Date.now()` e duas confirmações seguidas caíram na mesma frase:
  "exato, é essa que te mandei" duas vezes, uma atrás da outra. Sorteio
  não garante variação — garante que às vezes varia.

  A contagem garante. E ela faz mais: a segunda frase já empurra pro
  próximo passo, porque quem repete que já sabe o número não quer ouvir
  o número, quer andar.

  Devolve null quando acabaram as variantes. Isso não é falta de texto —
  é o sinal de que o bot não está resolvendo, e quem chama trata como
  handoff. Cliente que diz três vezes "você já me disse" precisa de
  gente, não de uma terceira paráfrase.
*/
export function jaTeFalei(nomeCliente, quantasVezesJaConfirmei = 0) {
  const frase = JA_TE_FALEI[quantasVezesJaConfirmei];
  return frase ? comNome(nomeCliente, frase) : null;
}

export function respostaObjecao(tipo, nomeCliente) {
  const curto = primeiroNome(nomeCliente);
  const nome = curto ? `, ${curto}` : "";
  switch (tipo) {
    case "nao_tem_interesse":
      return `Entendo perfeitamente${nome}. A ideia era só verificar sem compromisso se conseguimos melhorar a condição do seu contrato atual. Prefere que eu encerre por aqui?`;
    case "vou_pensar":
      return `Sem problema${nome}, pode avaliar com calma. Ficou alguma dúvida sobre como funciona que eu possa te esclarecer agora?`;
    case "conversar_familia":
      return `Claro${nome}, faz todo sentido conversar em casa primeiro. Quer que eu deixe um resumo simples do que estamos verificando para vocês olharem juntos?`;
    case "recusa_oferta":
      return `Entendo o seu ponto${nome}. Quer que eu peça para o consultor verificar se existe outra configuração possível ou prefere encerrar?`;
    case "golpe_seguranca":
    case "duvida_seguranca":
      return `Sua cautela está certíssima${nome}. Nós nunca cobramos nada adiantado, nunca pedimos senhas e qualquer assinatura ocorre somente no aplicativo oficial do banco.`;
    case "reclamacao_grave":
    case "ameaca_denuncia":
      return `Entendo sua preocupação${nome} e respeito totalmente sua posição. Estou encerrando o atendimento automático agora e passando para o responsável verificar.`;
    case "nao_envia_documentos":
      return `Tudo bem${nome}, respeito sua decisão e não vou insistir no envio. Se quiser, podemos tirar qualquer dúvida primeiro ou falar direto com o consultor.`;
    case "ja_tem_consultor":
      return `Ótimo que você já tem alguém de confiança${nome}! Se em algum momento quiser apenas comparar sem compromisso, fico à disposição.`;
    case "nao_entendeu":
      return `Explicando de forma simples${nome}: nós verificamos no sistema do banco se é possível melhorar as condições do seu contrato atual. Quer que eu confirme o seu caso com o consultor?`;
    case "confirmacao_documentos":
      return `Isso mesmo${nome}! Com a documentação conferida a gente já encaminha para a análise final no banco.`;
    default:
      return `Entendo perfeitamente${nome}. Se quiser que eu verifique alguma dúvida com o consultor, é só me falar.`;
  }
}

export function respostaRecusaContextual(rotuloRecusado, nomeCliente) {
  const curto = primeiroNome(nomeCliente);
  const item = rotuloRecusado && rotuloRecusado !== "geral" ? ` o ${rotuloRecusado}` : " esse documento";
  const frase = `Tudo bem, respeito sua decisão e não vou pedir${item} novamente. Vou verificar com o consultor como podemos te ajudar sem isso.`;
  return curto ? `${curto}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
}

export function respostaEsclarecimentoContextual(contexto = {}, nomeCliente = null) {
  const curto = primeiroNome(nomeCliente);
  const { ultimoRequisito, ultimaPerguntaAgente } = contexto;
  let frase;
  if (ultimoRequisito && REQUISITOS[ultimoRequisito]) {
    frase = `Perdão se ficou confuso! Eu estava perguntando sobre o ${REQUISITOS[ultimoRequisito].rotulo} apenas para o consultor conseguir conferir os dados do seu contrato.`;
  } else if (ultimaPerguntaAgente) {
    frase = `Me desculpa se não ficou claro! Eu quis confirmar os dados básicos para o consultor analisar o seu caso certinho.`;
  } else {
    frase = `Me desculpa se não ficou claro! Estou verificando as informações do seu contrato com o consultor para te explicar passo a passo.`;
  }
  return curto ? `${curto}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
}

export function respostaCobrancaContextual(contexto = {}, nomeCliente = null) {
  const curto = primeiroNome(nomeCliente);
  let frase;
  if (contexto.aguardandoConsultor) {
    frase = "Oi! Ainda estou aguardando a confirmação do consultor aqui no sistema e te aviso assim que sair.";
  } else if (contexto.ultimoRequisito && REQUISITOS[contexto.ultimoRequisito]) {
    frase = `Oi! Estou por aqui. Ficou alguma dúvida sobre o que conversamos antes?`;
  } else {
    frase = "Oi! Estou por aqui, pode falar.";
  }
  return curto ? `${curto}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
}

/* ------------------------------------------------------------------
   A escolha
------------------------------------------------------------------ */

/*
  Dada a situação, existe resposta determinística? Devolve o texto ou null.
*/
export function respostaDeterministica({
  categoria,
  mensagemCliente,
  nomeCliente = null,
  pedido = null,
  fatosNovos = null,
  objecao = null,
  semente,
}) {
  let texto = null;

  if (categoria === "objecao" || objecao) {
    texto = respostaObjecao(objecao?.tipo, nomeCliente);
  } else if (categoria === "saudacao") {
    texto = saudacao(mensagemCliente, nomeCliente, semente);
  } else if (pedido?.texto) {
    texto = pedirOQueFalta(pedido, nomeCliente);
  } else if (fatosNovos && (fatosNovos.convenio || fatosNovos.banco)) {
    texto = informacaoRecebida(fatosNovos, nomeCliente);
  }

  return conferido(texto);
}

/*
  A última porta deste arquivo.
*/
const ROTULOS_DE_REQUISITO = Object.values(REQUISITOS).map((r) => r.rotulo);

export function conferido(texto) {
  if (!texto || !texto.trim()) return null;

  /*
    Número é o corte que não tem exceção. Nenhuma frase deste arquivo
    precisa de dígito — nem a que lista o que falta, nem contorno de objeção.
  */
  if (/\d/.test(texto)) return null;

  if (!checarGatilhos(texto).travou) return texto;

  /*
    Travou. Só passa se o que fez travar for um rótulo de requisito — e
    a prova é remover os rótulos e o gatilho parar de disparar. Sobrou
    alguma outra coisa que cheira a dinheiro? Não sai.
  */
  let semRotulos = texto;
  for (const rotulo of ROTULOS_DE_REQUISITO) {
    semRotulos = semRotulos.replaceAll(rotulo, "documento");
  }

  return checarGatilhos(semRotulos).travou ? null : texto;
}

/*
  Este texto é uma das minhas confirmações de "já te passei"?

  Serve pra contar quantas vezes já confirmei nesta conversa, e por isso
  compara com as frases de verdade em vez de procurar palavra solta —
  "isso mesmo" aparece em resposta legítima de outro assunto.
*/
export function ehConfirmacaoDeQueJaFalei(texto) {
  /*
    Sem caixa: `comNome` minusculiza a primeira letra ao prefixar o nome,
    então o texto gravado é "Ademar, isso mesmo…" e a frase original é
    "Isso mesmo…". Comparando com caixa, a contagem dava sempre zero e as
    duas confirmações saíam idênticas — que era exatamente o defeito que
    esta contagem existe pra evitar.
  */
  const t = String(texto ?? "").toLowerCase();
  return JA_TE_FALEI.some((frase) => t.includes(frase.toLowerCase()));
}
