import { ACOES } from "./decidir.js";
import { checarGatilhos } from "../gatilhos.js";
import { conferir, numerosDeRisco, sobrouMarcador } from "../numeros.js";
import { REQUISITOS, semRotulosDeRequisito, foiRecusado } from "../requisitos.js";

/*
  ============================================================================
  O PORTEIRO

  Três checagens, e a distinção importa:

    validarDecisao()      — a decisão faz sentido? Roda ANTES de agir.
    validarTexto()        — o básico: número inventado, marcador, "não sei".
    validarAntesDeEnviar()— tudo, com o caso todo na mão. É a última porta
                            antes do cliente, e nenhuma mensagem passa por
                            fora dela.

  Regra da casa: nada aqui pergunta pra IA se a resposta da IA está boa.
  Modelo avaliando o próprio texto erra junto — se ele achou correto
  escrever, vai achar correto aprovar. Tudo aqui é determinístico.

  Reprovar nunca significa "envia mesmo assim": significa que o consultor
  entra. Falhar para o lado de chamar gente é sempre o lado barato.

  Cada reprovação devolve um `codigo`. Não é enfeite: é o que aparece nas
  métricas, e é como se descobre que o bot está sendo barrado sempre pelo
  mesmo motivo — que é o sinal de que falta um fato no manual, não de que
  o porteiro está rígido demais.
  ============================================================================
*/

const ACOES_VALIDAS = new Set(Object.values(ACOES));

export function validarDecisao(decisao) {
  const problemas = [];

  if (!decisao || !ACOES_VALIDAS.has(decisao.acao)) {
    return { ok: false, problemas: ["ação desconhecida"] };
  }

  if (typeof decisao.confianca !== "number" || decisao.confianca < 0 || decisao.confianca > 1) {
    problemas.push("confiança fora da faixa");
  }

  if (!decisao.motivo) problemas.push("decisão sem motivo legível");

  // Perguntar ao cliente sem ter o que perguntar viraria mensagem vazia.
  if (decisao.acao === ACOES.PERGUNTAR_CLIENTE) {
    if (!decisao.pedido?.texto || !decisao.pedido?.chaves?.length) {
      problemas.push("pedido ao cliente sem conteúdo");
    }
  }

  return { ok: problemas.length === 0, problemas };
}

/*
  O texto pode sair? Versão curta, usada onde não há o caso todo na mão.

  `fontesPermitidas` são os lugares de onde um número pode legitimamente ter
  vindo: a resposta do consultor, a pergunta do cliente, o manual da
  operação. Número que não está em nenhuma delas foi inventado agora.
*/
export function validarTexto(texto, { permitirNumeros = false, fontesPermitidas = [] } = {}) {
  if (!texto || !texto.trim()) {
    return { ok: false, codigo: "vazio", motivo: "texto vazio" };
  }

  if (texto.trim().length < 12) {
    return { ok: false, codigo: "curto", motivo: "resposta curta demais pra ser resposta" };
  }

  // "Não sei" é coisa que consultor não diz — ele verifica e volta.
  if (/n[aã]o[\s_]*sei/i.test(texto)) {
    return { ok: false, codigo: "nao_sei", motivo: "a IA disse que não sabe" };
  }

  // Marcador de exemplo que vazou: o cliente receberia "liberar R$ VALOR".
  if (sobrouMarcador(texto)) {
    return { ok: false, codigo: "marcador", motivo: "sobrou marcador de exemplo no texto" };
  }

  /*
    Procedência dos números. Vale inclusive quando `permitirNumeros` está
    ligado — nesse caso o consultor deu um dado, e o que se confere é se a
    IA acrescentou algum outro por conta própria.
  */
  const inventados = conferir(texto, ...fontesPermitidas);
  if (inventados.length) {
    return {
      ok: false,
      codigo: "inventou_numero",
      motivo: `a IA inventou ${inventados.join(", ")}`,
      inventados,
    };
  }

  if (permitirNumeros) return { ok: true };

  /*
    Sem dado do consultor na mão, o texto não pode nem cheirar a dinheiro.
    Aqui pega palavra além de número: "sua parcela vai ficar tranquila" não
    tem cifra e mesmo assim é promessa financeira.
  */
  const { travou, motivo } = checarGatilhos(texto);
  if (!travou) return { ok: true };

  /*
    ================================================================
    NOME DE DOCUMENTO NÃO É VALOR

    "Extrato de margem" contém a palavra "margem". O bot pede esse papel
    numa mensagem, e a frase passa a viver no CONTEXTO da conversa — que
    é o que ele lê pra responder a próxima.

    Foi assim que o cliente perguntou "quanto tempo demora pra cair?" e
    recebeu "vou verificar". Reproduzido três vezes em três: a resposta
    certa mencionava o extrato que o próprio bot tinha pedido.

    A prova é comparativa: troca os nomes de documento por "documento" e
    roda o gatilho de novo. Parou de disparar? O que travou era o nome do
    papel. Continua disparando? É dinheiro, e não passa.

    O redator tem esta mesma exceção. Precisa estar nos dois: são dois
    guardas independentes, e consertar um só deixa o outro barrando —
    que foi exatamente o que aconteceu aqui.

    O que isto NÃO libera: "sua margem está liberada" não contém o rótulo
    "extrato de margem", então a troca não muda nada. E número já foi
    conferido acima, contra as fontes permitidas.
    ================================================================
  */
  if (!checarGatilhos(semRotulosDeRequisito(texto)).travou) {
    return { ok: true };
  }

  return { ok: false, codigo: "e_do_consultor", motivo: `a IA escreveu sobre valor (${motivo})` };
}

/* ------------------------------------------------------------------
   As checagens que só fazem sentido com o caso inteiro na mão
------------------------------------------------------------------ */

/*
  Texto que não parece mensagem de WhatsApp. Cada padrão aqui apareceu de
  verdade em teste com modelo pequeno: ele devolve o JSON do prompt, começa
  com "Você:", abre um bloco de código, ou entra em loop de caractere.
*/
const MALFORMADO = [
  [/^\s*[{[]/, "veio JSON em vez de mensagem"],
  [/```/, "veio bloco de código"],
  [/^\s*(?:Cliente|Você|Assistente|Sistema)\s*:/im, "veio com etiqueta de papel"],
  [/(.)\1{6,}/, "caractere repetido em looping"],
  [/\b(?:como (?:uma? )?(?:IA|inteligência artificial)|modelo de linguagem)\b/i, "a IA falou que é IA"],
  [/REGRAS QUE NÃO SE QUEBRAM|NAO_SEI/, "vazou pedaço do prompt"],
  /*
    Modelo de raciocínio vazando o rascunho dele. O catálogo do Groq mudou
    no meio da sessão e um dos substitutos disponíveis (qwen3.6) devolve o
    pensamento inteiro dentro de <think>. O cliente receberia isso.
  */
  [/<\/?think>|<\/?reasoning>|<\|channel\|>/i, "vazou o raciocínio do modelo"],
];

const LIMITE_DE_TAMANHO = 900;

export function textoMalformado(texto) {
  for (const [padrao, motivo] of MALFORMADO) {
    if (padrao.test(texto)) return motivo;
  }
  if (texto.length > LIMITE_DE_TAMANHO) return "mensagem longa demais pra WhatsApp";
  return null;
}

/*
  Tentativa de virar o bot pelo texto do CLIENTE. Não valida a saída: olha
  a entrada e manda o caso pra gente.

  Isso não é paranoia de segurança de laboratório — é o vizinho esperto
  testando o bot, e é o concorrente descobrindo o que ele responde. O
  prejuízo real não é o segredo do prompt: é o bot ser convencido a
  "confirmar" um valor.
*/
const INJECAO = [
  /ignore?\s+(?:as\s+)?(?:instru|regras)/i,
  /desconsidere?\s+(?:as\s+)?(?:instru|regras|orienta)/i,
  /esque[çc]a\s+(?:as\s+)?(?:instru|regras)/i,
  /\b(?:system|assistant|user)\s*:/i,
  /voc[êe]\s+(?:agora\s+)?[ée]\s+(?:um|uma)\s+\w+/i,
  /finja\s+que|faz\s+de\s+conta\s+que|aja\s+como/i,
  /repita\s+(?:suas?\s+)?(?:instru|regras|prompt)/i,
  /qual\s+(?:é\s+)?(?:o\s+)?seu\s+prompt/i,
  /modo\s+(?:desenvolvedor|debug|dev)/i,
];

export function cheiroDeInjecao(mensagem) {
  if (!mensagem) return null;
  for (const padrao of INJECAO) {
    if (padrao.test(mensagem)) return "a mensagem tenta mudar as regras do bot";
  }
  return null;
}

/*
  Número que veio dos exemplos de estilo.

  Os exemplos entram mascarados no prompt, mas a máscara é uma defesa, não
  uma garantia: exemplo novo pode ter formato que ela não pega. Se um
  número inventado aparece TAMBÉM num exemplo, não é coincidência — é o
  valor de um cliente antigo indo para um cliente novo, que é o pior erro
  que este produto pode cometer.
*/
export function veioDoExemplo(inventados, exemplos) {
  if (!inventados?.length || !exemplos?.length) return null;

  const dosExemplos = new Set();
  for (const e of exemplos) {
    numerosDeRisco(e?.resposta_ryan ?? "").forEach((n) => dosExemplos.add(n));
  }

  const copiados = inventados.filter((n) => dosExemplos.has(n));
  return copiados.length ? copiados : null;
}

/*
  Nome de gente que não é este cliente.

  Mesma lógica: se um primeiro nome aparece no rascunho e ele está nos
  exemplos mas não nesta conversa, o modelo copiou o exemplo inteiro. O
  cliente receberia uma mensagem endereçada a outra pessoa.
*/
/*
  Nome em POSIÇÃO DE VOCATIVO: no começo da mensagem, seguido de vírgula.
  "Marlene, consegui liberar…" — é assim que o consultor chama o cliente, e
  é a única posição em que dá pra afirmar que uma palavra maiúscula é gente.

  A primeira versão disto pegava qualquer palavra capitalizada com 3+ letras
  e descontava uma lista de palavras comuns. O teste de ponta a ponta matou
  essa ideia em quinze minutos: o modelo escreveu "Tudo bem?", "Tudo" não
  estava na lista, "tudo bem" aparecia nos exemplos — e o validador barrou
  uma saudação perfeita dizendo que era nome de outro cliente.

  Lista de exceção é dívida: sempre falta uma palavra, e cada falta vira uma
  mensagem barrada à toa. Posição gramatical não tem esse problema.
*/
const VOCATIVO = /(?:^|[\n.!?]\s*)([A-ZÀ-Ý][a-zà-ÿ]{2,})\s*,/g;

function nomesEmVocativo(texto) {
  const achados = new Set();
  for (const m of (texto ?? "").matchAll(VOCATIVO)) achados.add(m[1]);
  return achados;
}

export function nomeDeOutroCliente(texto, { nomeCliente, exemplos, contexto, manual }) {
  const noRascunho = nomesEmVocativo(texto);
  if (noRascunho.size === 0) return null;

  /*
    Quem pode ser chamado assim: o próprio cliente, e qualquer nome que já
    apareceu nesta conversa ou no manual — aí não é vazamento de exemplo, é
    alguém que existe no caso.
  */
  const permitido = new Set();
  for (const m of `${contexto ?? ""} ${manual ?? ""}`.matchAll(/\b([A-ZÀ-Ý][a-zà-ÿ]{2,})\b/g)) {
    permitido.add(m[1]);
  }
  if (nomeCliente) {
    for (const parte of String(nomeCliente).trim().split(/\s+/)) permitido.add(parte);
  }

  const dosExemplos = new Set();
  for (const e of exemplos ?? []) {
    for (const n of nomesEmVocativo(e?.resposta_ryan ?? "")) dosExemplos.add(n);
  }

  for (const nome of noRascunho) {
    if (permitido.has(nome)) continue;
    if (dosExemplos.has(nome)) return nome;
  }

  return null;
}

/*
  Contradiz o que o consultor ensinou.

  Checagem estreita de propósito: só pega negação explícita do manual sendo
  afirmada no rascunho. "Não atendemos servidor municipal" no manual e
  "atendemos servidor municipal" no rascunho.

  Não tento entender o texto — entender exigiria um modelo, e modelo
  julgando modelo é o que este arquivo inteiro existe pra evitar. Estreita
  e certa vale mais que ampla e chutada.
*/
const NEGACAO_NO_MANUAL =
  /n[ãa]o\s+(?:atendemos|trabalhamos com|fazemos|aceitamos|temos|oferecemos)\s+([^.\n;]{3,40})/gi;

export function contradizOManual(texto, manual) {
  if (!manual?.trim()) return null;

  for (const m of manual.matchAll(NEGACAO_NO_MANUAL)) {
    const objeto = m[1].trim().toLowerCase();
    if (objeto.length < 4) continue;

    // O rascunho afirma o mesmo objeto sem a negação por perto?
    const posicao = texto.toLowerCase().indexOf(objeto);
    if (posicao === -1) continue;

    const antes = texto.toLowerCase().slice(Math.max(0, posicao - 40), posicao);
    if (/\bn[ãa]o\b|\bsem\b|\binfelizmente\b/.test(antes)) continue;

    return objeto;
  }

  return null;
}

/*
  Pergunta o que já sabe.

  Cliente que responde a mesma pergunta duas vezes conclui, com razão, que
  do outro lado não tem ninguém prestando atenção. É a falha que fez a
  memória existir, e o rascunho é o último lugar onde dá pra pegá-la.
*/
const PISTAS = {
  convenio: /\b(?:inss|aposentad|pensionist|servidor|conv[êe]nio)\b/i,
  banco: /\bqual\s+banco|em\s+qual\s+banco|\bseu\s+banco\b/i,
  contracheque: /\bcontracheque\b/i,
  margem: /\b(?:extrato\s+de\s+)?margem\b/i,
  documento_foto: /\bdocumento\s+com\s+foto\b/i,
  comprovante_endereco: /\bcomprovante\s+de\s+endere[çc]o\b/i,
  conta_bancaria: /\bag[êe]ncia\s+e\s+conta\b/i,
};

function jaSabe(memoria, chave) {
  if (!memoria) return false;
  if (chave === "convenio") return !!memoria.convenio;
  if (chave === "banco") return !!memoria.banco;
  return memoria.coletado?.[chave]?.confirmado === true;
}

export function repergunta(texto, memoria) {
  // Só vale se o rascunho de fato pergunta alguma coisa.
  if (!/\?/.test(texto)) return null;

  for (const [chave, pista] of Object.entries(PISTAS)) {
    if (!jaSabe(memoria, chave)) continue;
    if (!pista.test(texto)) continue;

    /*
      Citar o que já sabe é diferente de perguntar de novo:

        "Como você é do INSS, o desconto cai no benefício. Quer que eu siga?"
        cita — a interrogação é de outra frase.

        "Você é do INSS ou servidor?"
        pergunta — a interrogação é desta.

      O que separa as duas é o ponto final no meio. Sem essa checagem, todo
      texto que menciona o convênio e termina com pergunta — que é o formato
      recomendado de TODA resposta aqui — seria barrado.
    */
    const depois = texto.slice(texto.search(pista));
    const fim = depois.indexOf("?");
    if (fim <= 0) continue;

    const ateAPergunta = depois.slice(0, fim);
    if (/[.!\n]/.test(ateAPergunta)) continue;

    return REQUISITOS[chave]?.rotulo ?? chave;
  }

  return null;
}

/*
  Verifica se o texto tenta pedir novamente um requisito que o cliente já recusou enviar.
*/
export function insisteEmItemRecusado(texto, memoria) {
  if (!memoria || !texto) return null;
  const pedeEnvio = /\b(?:me\s+manda|manda\s+pra\s+mim|envia|enviar|preciso\s+d[eo]|mandar\s+(?:a\s+foto|o\s+extrato|o\s+documento|o\s+contracheque|o\s+comprovante))\b/i.test(
    texto
  );
  if (!pedeEnvio && !/\?/.test(texto)) return null;

  // Se o texto afirma explicitamente que NÃO vai pedir, permite
  if (/\bn[aã]o\s+vou\s+(?:te\s+)?(?:pedir|insistir)/i.test(texto)) return null;

  for (const [chave, pista] of Object.entries(PISTAS)) {
    if (!foiRecusado(memoria, chave)) continue;
    if (pista.test(texto)) {
      return REQUISITOS[chave]?.rotulo ?? chave;
    }
  }
  return null;
}

/*
  Verifica promessas financeiras sem lastro explícito nas fontes permitidas
  (ex.: prometer que a parcela não sobe um centavo ou que já está aprovado sem o consultor ter dito isso).
*/
const PROMESSAS_SEM_LASTRO = [
  [/\bsem\s+(?:subir|aumentar)\s+(?:um\s+centavo|nada)\s+na\s+(?:sua\s+)?parcela\b/i, "prometeu manutenção de parcela sem confirmação na fonte"],
  [/\bparcela\s+continua\s+rigorosamente\s+igual\b/i, "prometeu parcela igual sem confirmação na fonte"],
  [/\bj[aá]\s+est[aá]\s+aprovad[oa]\s+e\s+reservad[oa]\b/i, "prometeu aprovação/reserva sem confirmação na fonte"],
];

export function promessaFinanceiraSemLastro(texto, fontesPermitidas = []) {
  if (!texto) return null;
  const fontesConcatenadas = fontesPermitidas.filter(Boolean).join(" \n ").toLowerCase();
  for (const [padrao, motivo] of PROMESSAS_SEM_LASTRO) {
    if (padrao.test(texto) && !padrao.test(fontesConcatenadas)) {
      return motivo;
    }
  }
  return null;
}

/* ------------------------------------------------------------------
   A última porta
------------------------------------------------------------------ */

/*
  Ordem: do mais barato e mais certo para o mais caro e mais interpretativo.
  A primeira que reprovar encerra — não adianta listar cinco motivos quando
  o primeiro já impede o envio.

  `paraOConsultor: true` significa que o caso não é só "não envia": é "não
  envia E alguém precisa olhar". Reprovação por texto malformado o bot pode
  simplesmente refazer; reprovação por valor inventado, não.
*/
export function validarAntesDeEnviar(texto, contexto = {}) {
  const {
    permitirNumeros = false,
    fontesPermitidas = [],
    exemplos = [],
    manual = "",
    memoria = null,
    nomeCliente = null,
    contextoDaConversa = "",
    mensagemCliente = "",
  } = contexto;

  /* 0. Bloqueio absoluto se o cliente estiver em opt-out (exceto confirmação única de opt-out). */
  if (contexto.conversa?.opt_out === true && contexto.categoria !== "opt_out") {
    return {
      ok: false,
      codigo: "opt_out_ativo",
      motivo: "contato em opt-out não pode receber mensagens automáticas",
      paraOConsultor: false,
    };
  }

  /* 1. O básico: vazio, curto, "não sei", marcador, número inventado. */
  const basico = validarTexto(texto, { permitirNumeros, fontesPermitidas });
  if (!basico.ok) {
    /*
      Número inventado que também está num exemplo é um caso à parte, e o
      motivo precisa dizer isso: "inventou 6240" manda investigar o modelo,
      "copiou 6240 de outro cliente" manda arrumar os exemplos.
    */
    const copiados = veioDoExemplo(basico.inventados, exemplos);
    if (copiados) {
      return {
        ok: false,
        codigo: "numero_de_exemplo",
        motivo: `copiou ${copiados.join(", ")} de um exemplo de estilo — isso é valor de outro cliente`,
        paraOConsultor: true,
      };
    }
    return { ...basico, paraOConsultor: basico.codigo !== "curto" };
  }

  /* 2. Forma. Barato, e nada disso pode chegar ao cliente. */
  const forma = textoMalformado(texto);
  if (forma) {
    return { ok: false, codigo: "malformado", motivo: forma, paraOConsultor: false };
  }

  /* 3. Dado de outro cliente. */
  const outro = nomeDeOutroCliente(texto, {
    nomeCliente,
    exemplos,
    contexto: contextoDaConversa,
    manual,
  });
  if (outro) {
    return {
      ok: false,
      codigo: "outro_cliente",
      motivo: `chamou o cliente de "${outro}", que é nome de um exemplo`,
      paraOConsultor: true,
    };
  }

  /* 4. Contradiz o que você ensinou. */
  const contra = contradizOManual(texto, manual);
  if (contra) {
    return {
      ok: false,
      codigo: "contradiz_manual",
      motivo: `afirmou "${contra}", e o seu manual diz o contrário`,
      paraOConsultor: true,
    };
  }

  /* 5. Pergunta o que já sabe. */
  const repetida = repergunta(texto, memoria);
  if (repetida) {
    return {
      ok: false,
      codigo: "repergunta",
      motivo: `ia perguntar de novo por ${repetida}, que o cliente já disse`,
      paraOConsultor: false,
    };
  }

  /* 5b. Insiste em item que o cliente já recusou enviar. */
  const recusado = insisteEmItemRecusado(texto, memoria);
  if (recusado) {
    return {
      ok: false,
      codigo: "item_recusado",
      motivo: `ia pedir novamente ${recusado}, que o cliente já recusou enviar`,
      paraOConsultor: true,
    };
  }

  /* 5c. Promessa financeira sem lastro nas fontes autorizadas. */
  const promessaSemBase = promessaFinanceiraSemLastro(texto, fontesPermitidas);
  if (promessaSemBase) {
    return {
      ok: false,
      codigo: "promessa_sem_lastro",
      motivo: promessaSemBase,
      paraOConsultor: true,
    };
  }

  /* 6. A mensagem do cliente era uma tentativa de virar o bot. */
  const injecao = cheiroDeInjecao(mensagemCliente);
  if (injecao) {
    return { ok: false, codigo: "injecao", motivo: injecao, paraOConsultor: true };
  }

  return { ok: true };
}

/*
  ============================================================================
  A IA NÃO PODE ENCURTAR A SUA RESPOSTA

  O caso que criou isto custou um cliente.

  O consultor digitou na Fila, três vezes:

    "preciso de: documento com foto, comprovante de endereço,
     contracheque atualizado e agência/conta"

  E o que saiu foi:

    "Me manda uma foto do seu documento com foto pra começar."
    "Sim, só isso. Me manda uma foto do seu documento pra começar."
    "Me manda uma foto do seu documento pra começar."

  Três dos quatro documentos sumiram. E na segunda o modelo AFIRMOU que
  aquilo era tudo — uma alegação que ele inventou, contradizendo a própria
  resposta que recebeu. O cliente respondeu "tenho certeza que o banco não
  pede só isso", e tinha razão.

  A causa foi uma instrução de estilo ("nunca escreva lista, peça um
  documento por vez") vazando pro caminho onde a resposta do consultor é a
  fonte da verdade. Pedir um por vez é bom quando o AGENTE decide o que
  pedir. Quando o consultor já respondeu, a resposta dele sai inteira.

  Para número existia conferência de procedência. Para uma lista de
  documentos não existia nada — o modelo podia descartar itens em silêncio,
  e descartou.

  ISTO CONTA ITENS, NÃO PALAVRAS

  Compara quantas coisas distintas a resposta do consultor enumera com
  quantas sobreviveram no texto da IA. Sumiu alguma, o texto é recusado e
  sai a resposta crua do consultor — feia, mas completa e verdadeira.
  ============================================================================
*/

/* Os nomes de documento que a operação usa, mais os separadores de lista. */
const COISAS_QUE_SE_PEDE =
  /\b(documento com foto|documenta[çc][ãa]o com foto|documento|documenta[çc][ãa]o|comprovante de endere[çc]o|comprovante|contracheque|holerite|extrato de margem|margem|ag[êe]ncia|conta|rg|cpf|cnh|selfie|carteira)\b/gi;

function coisasCitadas(texto) {
  const achadas = new Set();
  for (const m of String(texto ?? "").matchAll(COISAS_QUE_SE_PEDE)) {
    /*
      "documento com foto" e "documento" são a mesma coisa citada de dois
      jeitos; conto uma. O que importa é quantas COISAS DIFERENTES foram
      pedidas, não quantas palavras casaram.
    */
    const chave = m[0]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/^(documento|documentacao)(\s+com\s+foto)?$/, "documento")
      .replace(/^comprovante(\s+de\s+endereco)?$/, "comprovante")
      .replace(/^(holerite)$/, "contracheque")
      .replace(/^(extrato de margem)$/, "margem");
    achadas.add(chave);
  }
  return achadas;
}

/*
  A IA descartou alguma coisa que o consultor pediu?

  Devolve a lista do que sumiu (vazia = pode enviar).
*/
export function oQueSumiuDaResposta(textoDaIA, respostaDoConsultor) {
  const pedidas = coisasCitadas(respostaDoConsultor);
  if (pedidas.size < 2) return [];

  const entregues = coisasCitadas(textoDaIA);
  return [...pedidas].filter((c) => !entregues.has(c));
}

/*
  A IA afirmou que aquilo era tudo, sem o consultor ter dito isso?

  "Sim, só isso" é uma alegação sobre o que o banco exige. Ela só pode sair
  se o consultor tiver dito algo equivalente — senão é o modelo decidindo
  sozinho um requisito de negócio.
*/
const AFIRMOU_QUE_E_TUDO =
  /\b(?:sim,?\s*)?(?:[ée]\s+)?(?:s[óo]|somente|apenas)\s+(?:isso|isto|esse|este|estes|isso mesmo)\b|\bs[óo]\s+precis\w+\s+(?:disso|desse)\b|\bmais\s+nada\b/i;

export function afirmouSerTudoSemBase(textoDaIA, respostaDoConsultor) {
  if (!AFIRMOU_QUE_E_TUDO.test(String(textoDaIA ?? ""))) return false;
  return !AFIRMOU_QUE_E_TUDO.test(String(respostaDoConsultor ?? ""));
}
