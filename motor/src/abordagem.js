import { extrairPorRegra } from "./extrair.js";

/*
  ============================================================================
  A ABORDAGEM DO RYAN

  Toda prospecção começa com a mesma mensagem, e ela não é um "olá, tudo
  bem?". Ela já diz três coisas: quem fala, que existe um contrato num banco
  específico, e qual é a oportunidade. O cliente responde a ISSO.

  O QUE ESTAVA QUEBRADO

  O bot só aprendia com o que o CLIENTE dizia. A própria abordagem carregava
  o nome e o banco — "Oi Ademar, seu contrato Santander" — e isso se perdia.
  Duas mensagens depois ele perguntava o banco que ele mesmo tinha citado.

  A informação não passa a existir porque o cliente a repetiu. Ela já existia
  na conversa. Ler as próprias mensagens é o mínimo que se espera de alguém
  que está prestando atenção.
  ============================================================================
*/

/*
  O texto padrão. Não é sugestão de tom: é a abordagem comercial, e mudar o
  sentido dela muda o que o cliente está respondendo quando diz "sim".
*/
export const ABORDAGEM_PADRAO =
  "Oi {NOME}, aqui é o Ryan. Vi que seu contrato {BANCO} tem margem pra reduzir " +
  "a taxa de juros e liberar um valor pra você, sem aumentar nada na folha. " +
  "Posso te mandar a simulação?";

/*
  Só o primeiro nome.

  O que chega aqui é o nome do contato do WhatsApp — "Ademar Elleres",
  "Maria Da Silva Santos". Ninguém cumprimenta alguém pelo nome completo.
  "Oi Ademar Elleres, aqui é o Ryan" é a assinatura de mala-direta, e é a
  PRIMEIRA linha que o cliente lê: ele decide ali se está falando com uma
  pessoa ou com um disparo.

  Nomes de partícula ("de", "da", "dos") não contam como primeiro nome, e
  nome de uma palavra só passa inteiro.
*/
const PARTICULA = /^(?:d[aeio]s?|e)$/i;

export function primeiroNome(nome) {
  const partes = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PARTICULA.test(p));

  return partes[0] ?? null;
}

export function montarAbordagem({ nome, banco = "Santander" }) {
  return ABORDAGEM_PADRAO.replace("{NOME}", primeiroNome(nome) ?? "tudo bem").replace(
    "{BANCO}",
    banco
  );
}

/*
  Esta mensagem é a abordagem?

  Reconhece pelo formato, não pelo texto exato: o consultor edita, o modelo
  reescreve o final, e a mensagem continua sendo a mesma abordagem. O que a
  identifica é a combinação — apresentação + contrato num banco + proposta
  de simulação.
*/
const MARCAS_DA_ABORDAGEM = [
  /\baqui\s+[ée]\s+o\s+\w+/i,
  /\b(?:vi que|reparei que|identifiquei que)\b/i,
  /\bcontrato\b/i,
];

export function ehAbordagem(texto) {
  const t = String(texto ?? "");
  if (t.length < 40) return false;

  const marcas = MARCAS_DA_ABORDAGEM.filter((m) => m.test(t)).length;
  const propoe = /\bsimula[cç][aã]o\b|\breduzir a taxa\b|\bliberar um valor\b/i.test(t);

  return marcas >= 2 && propoe;
}

/*
  O que a mensagem do BOT ensina sobre o cliente.

  Reusa `extrairPorRegra` — o mesmo extrator determinístico que lê a
  mensagem do cliente. Banco e nome saem dele; o que muda é de onde a frase
  veio.

  O nome tem uma regra própria aqui: na abordagem ele vem logo depois do
  "Oi", que é uma posição que `extrairPorRegra` não olha (lá ele só aceita
  apresentação explícita — "meu nome é X" — porque deduzir nome de mensagem
  de cliente dá errado).
*/
/*
  O cumprimento é caso-insensível; o nome NÃO é.

  Não dá pra pôr o flag `i` na expressão inteira: com ele, `[A-ZÀ-Ý]` passa
  a aceitar minúscula, e "Oi tudo bem" gravaria um cliente chamado "tudo".
  A maiúscula do nome é justamente o que o separa do resto da frase.
*/
const NOME_NA_ABERTURA =
  /^\s*(?:[Oo]i+|[Oo]l[aá]|[Ee] a[ií]|[Oo]pa)[,!\s]+([A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ]{2,})?)/;

/*
  "Aqui é o Ryan" é o CONSULTOR se apresentando, não o cliente.

  Esse detalhe custou um teste: `extrairPorRegra` tem um padrão pra "aqui é
  o X" — que está certo quando quem escreve é o cliente, e exatamente
  errado quando quem escreve é o Ryan. A mesma frase, lados opostos da
  conversa, significados opostos.

  Na abordagem, o nome do cliente é o que vem depois do "Oi". O que vem
  depois de "aqui é o" é quem está falando.
*/
const QUEM_FALA = /\baqui\s+[ée]\s+(?:o|a)?\s*([A-ZÀ-Ý][a-zà-ÿ]{2,})/;

export function oQueAAbordagemEnsina(texto) {
  const daRegra = extrairPorRegra(texto);

  const m = String(texto ?? "").match(NOME_NA_ABERTURA);
  const doCliente = m ? m[1].trim().split(/\s+/)[0] : null;

  const q = String(texto ?? "").match(QUEM_FALA);
  const doConsultor = q ? q[1] : null;

  /*
    O nome da abertura ganha. E se a regra tiver pescado o nome do
    consultor, ele é descartado — nunca vira o nome do cliente.
  */
  const daRegraServe = daRegra.nome && daRegra.nome !== doConsultor ? daRegra.nome : null;

  return {
    nome: doCliente ?? daRegraServe,
    banco: daRegra.banco,
    // A abordagem propõe redução de taxa. É o objetivo, dito por quem abordou.
    objetivo: /reduzir\s+a\s+taxa|redu[cç][aã]o\s+de\s+taxa/i.test(texto ?? "")
      ? "reducao_taxa"
      : daRegra.objetivo,
  };
}

/*
  O cliente aceitou a proposta da abordagem?

  "Sim", "pode", "manda" — respostas curtas que só fazem sentido coladas na
  pergunta anterior. Fora do contexto da abordagem elas não querem dizer
  nada, e é por isso que quem chama precisa saber que estava esperando.
*/
const ACEITOU =
  /^(?:sim|pode|manda|pode mandar|manda sim|quero|claro|bora|vamos|isso|aceito|ok|tá|ta|beleza|blz|por favor|pf|sim por favor|manda a[ií])[\s!.,?]*$/i;

export function aceitouAAbordagem(texto) {
  return ACEITOU.test(String(texto ?? "").trim());
}
