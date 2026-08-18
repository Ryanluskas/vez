/*
  ============================================================================
  O QUE DÁ PRA SABER SEM PERGUNTAR PRO MODELO

  Medido no teste de ponta a ponta: o llama3.2:3b acertou 2 de 9 extrações.
  "Sou aposentado do INSS" devolvia `convenio: null`; "sou servidor público
  estadual" virava `nome: "servidor público estadual"`; "quero baixar minha
  taxa" virava `nome: "Taxa"`.

  A consequência não era teórica — o bot perguntava ao cliente o convênio
  que ele tinha acabado de dizer. É a falha que faz o cliente concluir, com
  razão, que do outro lado não tem ninguém prestando atenção.

  E o custo era duplo: cada extração dessas levava dezenas de segundos.

  POR QUE ISSO É CÓDIGO E NÃO PROMPT

  Convênio é um enum de quatro valores com palavras óbvias. Banco é uma
  lista fechada. Objetivo é um enum de cinco. Nada disso é interpretação de
  linguagem — é reconhecimento de palavra, e é a mesma doutrina que já vale
  em `requisitos.js`: regra de negócio não é interpretação.

  O modelo continua servindo pro que ele faz melhor que regex: entender a
  frase torta que não casa com padrão nenhum. Este arquivo roda ANTES dele e
  resolve o caso comum em microssegundos.
  ============================================================================
*/

/* Sem acento e em minúscula: "benefício" e "beneficio" têm que casar igual. */
function simplificar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* ------------------------------------------------------------------
   Convênio
------------------------------------------------------------------ */

/*
  A ordem importa: militar antes de servidor, porque militar TAMBÉM é
  servidor público e a resposta mais específica é a certa.
*/
const CONVENIOS = [
  [
    "militar",
    /\b(?:militar|exercito|aeronautica|marinha|policia militar|bombeiro|pm|fab|reserva remunerada)\b/,
  ],
  [
    "inss",
    /\b(?:inss|aposentad\w*|pensionist\w*|beneficio|previdencia|meu benef|recebo pelo inss|encosto)\b/,
  ],
  [
    "servidor",
    /\b(?:servidor\w*|funcionari\w* public\w*|prefeitura|estadual|municipal|siape|federal|professor\w* d[ao] (?:estado|municipio|rede))\b/,
  ],
];

export function convenioDe(texto) {
  const t = simplificar(texto);
  for (const [chave, padrao] of CONVENIOS) {
    if (padrao.test(t)) return chave;
  }
  return null;
}

/* ------------------------------------------------------------------
   Banco
------------------------------------------------------------------ */

/*
  Lista fechada, com o nome do jeito que se escreve no WhatsApp. Banco fora
  daqui fica pro modelo — e é o único caso em que ele ainda é chamado pra
  isso.

  O valor guardado é o nome bonito, não o que o cliente digitou: "santander"
  e "Santader" viram os dois "Santander", e a memória fica limpa.
*/
const BANCOS = [
  ["Santander", /\bsantand\w*/],
  ["Itaú", /\bitau\b|\bitaú\b/],
  ["Bradesco", /\bbradesc\w*/],
  ["Caixa", /\bcaixa\b|\bcef\b/],
  ["Banco do Brasil", /\bbanco do brasil\b|\bbb\b/],
  ["BMG", /\bbmg\b/],
  ["C6", /\bc6\b|\bc6 bank\b/],
  ["Pan", /\bpan\b|\bbanco pan\b/],
  ["Daycoval", /\bdaycoval\b|\bday coval\b/],
  ["Safra", /\bsafra\b/],
  ["Olé", /\bole consignado\b|\bolé\b|\bole\b(?! )/],
  ["Facta", /\bfacta\b/],
  ["Master", /\bmaster\b/],
  ["Mercantil", /\bmercantil\b/],
  ["Banrisul", /\bbanrisul\b/],
  ["Crefisa", /\bcrefisa\b/],
  ["Agibank", /\bagibank\b|\bagi\b/],
  ["Inter", /\bbanco inter\b|\binter\b/],
  ["Bity", /\bbity\b/],
  ["Cetelem", /\bcetelem\b/],
  ["Digio", /\bdigio\b/],
  ["Zema", /\bzema\b/],
  ["Paraná Banco", /\bparana banco\b/],
  ["Banco Alfa", /\bbanco alfa\b|\balfa\b/],
  ["Sicoob", /\bsicoob\b/],
  ["Sicredi", /\bsicredi\b/],
  ["Banese", /\bbanese\b/],
  ["BRB", /\bbrb\b/],
  ["Banco Cbss", /\bcbss\b/],
  ["Happy", /\bhappy\b/],
  ["Quero+", /\bquero ?\+|\bquero mais\b/],
];

export function bancoDe(texto) {
  const t = simplificar(texto);
  for (const [nome, padrao] of BANCOS) {
    if (padrao.test(t)) return nome;
  }
  return null;
}

/* ------------------------------------------------------------------
   Nome
------------------------------------------------------------------ */

/*
  Só pega apresentação explícita. Não deduz nome de nada — nome errado na
  memória vira mensagem endereçada à pessoa errada, e o cliente percebe na
  primeira linha.
*/
const APRESENTACOES = [
  /\bme chamo\s+([a-zà-ÿ]+)/i,
  /\bmeu nome (?:e|é)\s+([a-zà-ÿ]+)/i,
  /\baqui (?:e|é)\s+(?:o|a)\s+([a-zà-ÿ]+)/i,
  /\b(?:sou|eh|e)\s+(?:o|a)\s+([a-zà-ÿ]+)\b/i,
];

/*
  Palavras que aparecem depois de "sou o/a" e não são nome de gente. Sem
  isto, "sou o titular" grava um cliente chamado Titular.
*/
const NAO_E_NOME = new Set([
  "titular", "cliente", "aposentado", "aposentada", "pensionista", "servidor",
  "servidora", "militar", "professor", "professora", "beneficiario", "mesmo",
  "proprio", "propria", "responsavel", "filho", "filha", "esposo", "esposa",
  "irmao", "irma", "neto", "neta", "sobrinho", "sobrinha", "pai", "mae",
]);

export function nomeDe(texto) {
  for (const padrao of APRESENTACOES) {
    const m = String(texto ?? "").match(padrao);
    if (!m) continue;

    const bruto = m[1].trim();
    if (bruto.length < 3) continue;
    if (NAO_E_NOME.has(simplificar(bruto))) continue;

    return bruto.charAt(0).toUpperCase() + bruto.slice(1).toLowerCase();
  }
  return null;
}

/* ------------------------------------------------------------------
   Objetivo
------------------------------------------------------------------ */

/*
  O artigo entre o verbo e o substantivo varia mais do que parece: "baixar a
  taxa", "baixar os juros", "reduzir minha parcela", "diminuir as prestações".
  Escrevi a primeira versão com três artigos e ela perdia "os juros" — que é
  justamente a forma mais comum.

  Plural também: `\bjuro\b` não casa "juros".
*/
const ARTIGO = "(?:[ao]s?\\s+|min[ha]a?s?\\s+|meus?\\s+|minhas?\\s+)?";
const DINHEIRO_MENSAL = "(?:taxas?|juros?|parcelas?|presta[cç][oõ]es|presta[cç][aã]o|mensalidades?)";

const OBJETIVOS = [
  ["portabilidade", /\bportabilidade\b|\bportar\b|\btrocar de banco\b|\blevar (?:meu|o) (?:contrato|emprestimo)\b/],
  [
    "reducao_taxa",
    new RegExp(
      `\\b(?:baixar|reduzir|diminuir|abaixar)\\s+${ARTIGO}${DINHEIRO_MENSAL}\\b` +
        `|\\btaxa menor\\b|\\bjuros? menor(?:es)?\\b|\\bparcela menor\\b`
    ),
  ],
  ["refinanciamento", /\brefin\w*|\brenovar\b|\brenovacao\b|\bcontinuar o contrato\b/],
  ["emprestimo_novo", /\bemprestimo novo\b|\bnovo emprestimo\b|\bfazer um emprestimo\b|\bpegar (?:um )?(?:emprestimo|dinheiro)\b|\bquero (?:um )?emprestimo\b/],
];

export function objetivoDe(texto) {
  const t = simplificar(texto);
  for (const [chave, padrao] of OBJETIVOS) {
    if (padrao.test(t)) return chave;
  }
  return null;
}

/* ------------------------------------------------------------------
   Tudo de uma vez
------------------------------------------------------------------ */

/*
  Lê a mensagem e devolve só o que deu pra afirmar com certeza. Campo que
  não casou fica null — e null aqui significa "o modelo que tente", não
  "não tem".
*/
export function extrairPorRegra(texto) {
  return {
    nome: nomeDe(texto),
    convenio: convenioDe(texto),
    banco: bancoDe(texto),
    objetivo: objetivoDe(texto),
  };
}

/*
  Ainda falta alguma coisa depois da regra? É o que decide se vale gastar
  uma chamada de modelo — que custa dezenas de segundos nesta máquina.
*/
export function aindaFalta(memoria, achados) {
  const campos = ["nome", "convenio", "banco", "objetivo"];
  return campos.some((c) => !memoria?.[c] && !achados?.[c]);
}

import { oQueEstaReferenciando } from "./referencias.js";

/*
  Esta mensagem tem CARA de conter algum fato sobre o cliente?

  Medido no teste de ponta a ponta: "oi, boa tarde" gastava 18 segundos de
  modelo tentando extrair nome, convênio, banco e objetivo de uma saudação
  — e voltava vazio, porque saudação não tem fato nenhum.

  Faltar campo não é motivo suficiente pra chamar o modelo. No começo da
  conversa falta TUDO, e é justamente quando chegam as mensagens mais
  curtas e mais vazias.
*/
const SO_CUMPRIMENTO =
  /^(?:oi+|ol[aá]|opa|e a[ií]|bom dia|boa tarde|boa noite|tudo bem|tudo bom|blz|beleza|obrigad[oa]|vlw|valeu|ok|certo|sim|n[aã]o|show|legal|perfeito|entendi)[\s!?.,…]*$/i;

export function pareceTerFato(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  /*
    ================================================================
    PONTEIRO PRA TRÁS NÃO CARREGA FATO

    "Aquele valor", "você já me disse", "já mandei", "mas você nem
    pediu isso" — nenhuma dessas frases diz nada NOVO sobre o cliente.
    São referências ao que já foi dito, e o que elas apontam já está no
    estado ou não está em lugar nenhum.

    Medido no teste do Ademar: as quatro mensagens do cliente eram
    todas referências, e as quatro chamaram o extrator. Com o modelo
    local frio isso é 12 segundos cada, quatro vezes, pra voltar vazio
    quatro vezes — e era a razão de o modo autônomo não fechar conta.

    Quem responde a essas frases é `referencias.js`, lendo o estado.
    Ninguém precisa de modelo pra isso.
    ================================================================
  */
  if (oQueEstaReferenciando(t)) return false;

  /*
    Resposta de uma palavra também não carrega fato. "Sim", "não" e
    "aquele" já saem pelo filtro de cumprimento; isto pega o resto
    ("pode", "beleza então", "isso mesmo") sem precisar listar tudo:
    duas palavras não formam "sou aposentado do INSS".
  */
  if (t.split(/\s+/).length <= 2 && !/\d/.test(t)) return false;

  /*
    Cumprimento sozinho, ou combinação de cumprimentos, não carrega fato.
    Testo cada pedaço separado por vírgula porque "oi, boa tarde" são dois
    cumprimentos, e nenhum dos dois diz nada sobre o cliente.
  */
  const pedacos = t.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (pedacos.length && pedacos.every((p) => SO_CUMPRIMENTO.test(p))) return false;

  // Frase curta demais pra conter "sou do INSS" ou "meu nome é X".
  return t.length >= 10;
}
