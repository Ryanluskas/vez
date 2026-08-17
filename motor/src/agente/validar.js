import { ACOES } from "./decidir.js";
import { checarGatilhos } from "../gatilhos.js";
import { conferir, numerosDeRisco, sobrouMarcador } from "../numeros.js";
import { REQUISITOS } from "../requisitos.js";

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
  if (travou) {
    return { ok: false, codigo: "e_do_consultor", motivo: `a IA escreveu sobre valor (${motivo})` };
  }

  return { ok: true };
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
const PALAVRAS_QUE_COMECAM_FRASE = new Set([
  "Oi", "Olá", "Ola", "Bom", "Boa", "Consegui", "Já", "Ja", "Pra", "Para",
  "Quer", "Vou", "Vamos", "Sim", "Não", "Nao", "Oi!", "Oba", "Show",
  "Oi,", "Perfeito", "Certo", "Oque", "Qualquer", "Oi.", "Assim", "Como",
  "Esse", "Essa", "Este", "Esta", "Isso", "Aqui", "Ai", "Aí", "Depois",
  "Obrigado", "Obrigada", "Beleza", "Legal", "Ótimo", "Otimo", "Só", "So",
  "Me", "Te", "Seu", "Sua", "INSS", "WhatsApp",
]);

function primeirosNomes(texto) {
  const achados = new Set();
  // Nome próprio: maiúscula seguida de minúsculas, 3+ letras.
  for (const m of (texto ?? "").matchAll(/\b([A-ZÀ-Ý][a-zà-ÿ]{2,})\b/g)) {
    if (!PALAVRAS_QUE_COMECAM_FRASE.has(m[1])) achados.add(m[1]);
  }
  return achados;
}

export function nomeDeOutroCliente(texto, { nomeCliente, exemplos, contexto, manual }) {
  const noRascunho = primeirosNomes(texto);
  if (noRascunho.size === 0) return null;

  const permitido = new Set();
  for (const n of primeirosNomes(`${contexto ?? ""} ${manual ?? ""}`)) permitido.add(n);
  if (nomeCliente) for (const n of primeirosNomes(nomeCliente)) permitido.add(n);

  const dosExemplos = new Set();
  for (const e of exemplos ?? []) {
    for (const n of primeirosNomes(e?.resposta_ryan ?? "")) dosExemplos.add(n);
    for (const n of primeirosNomes(e?.mensagem_cliente ?? "")) dosExemplos.add(n);
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

  /* 6. A mensagem do cliente era uma tentativa de virar o bot. */
  const injecao = cheiroDeInjecao(mensagemCliente);
  if (injecao) {
    return { ok: false, codigo: "injecao", motivo: injecao, paraOConsultor: true };
  }

  return { ok: true };
}
