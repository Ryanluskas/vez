/*
  ============================================================================
  NÚMEROS — de onde eles podem vir, e de onde não podem

  Este arquivo existe por causa de uma falha que só apareceu na simulação:
  o bot copiou os números do EXEMPLO de estilo. Os exemplos ensinam o tom,
  mas o modelo pequeno também copia o conteúdo — e em produção isso seria
  citar o valor de um cliente antigo para um cliente novo.

  Duas defesas:
    mascarar()  — tira os números dos exemplos antes de mostrar ao modelo
    conferir()  — recusa o rascunho que tem número que o consultor não deu
  ============================================================================
*/

/*
  So interessa numero que parece dinheiro ou prazo. "2 dias uteis" pode passar;
  "R$ 6.240" ou "84x" so se o consultor tiver escrito.
*/
const PADROES = [
  /*
    Para no ultimo digito, de proposito. Com [\d.,]+ este padrao comia a
    virgula da frase — "R$ 6.240,00, em 84x" virava "R$ 6.240,00," e o
    Number() dava NaN. O valor sumia da lista de permitidos e o proprio
    texto do consultor era acusado de invencao.
  */
  /r\$\s*\d[\d.]*(?:,\d{1,2})?/gi,
  /\b\d{2,3}\s*(?:x|vezes|parcelas|meses)\b/gi,

  /*
    Taxa vem antes dos padroes de decimal, e e a unica que aceita numero
    pequeno. "1,49" sozinho pode ser qualquer coisa; "1,49%" e sempre juros,
    e juros inventado e o erro mais caro que este bot poderia cometer.

    O (?:[.,]\d+)? tem que estar aqui: sem ele o regex casava so o "49%" de
    "1,49%" e a taxa passava batido — o piso de 10 descartava o "1,49" e o
    detector dizia que estava tudo certo.
  */
  { re: /\b\d+(?:[.,]\d+)?\s*%/g, taxa: true },

  /\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g,
  /\b\d+,\d{2}\b/g,
  /\b\d{3,}\b/g,
];

/*
  "R$ 6.240,00", "6240,00" e "6.240" sao o MESMO numero. Sem normalizar,
  a conferencia acusa a toa toda vez que o modelo formata diferente.
*/
export function canonico(bruto, { taxa = false } = {}) {
  let s = String(bruto).replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/\.(?=\d{3}\b)/g, "");

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  /*
    Taxa fica num espaco proprio: "1.49%" nunca vai bater com o valor 1.49
    que porventura apareca no texto. E aceita numero pequeno, porque taxa
    e pequena por natureza.
  */
  if (taxa) return n > 0 ? `${n}%` : null;

  // Abaixo de 10 nao e dinheiro nem prazo de emprestimo: e "2 dias uteis".
  if (n < 10) return null;
  return String(n);
}

/*
  Os padroes rodam do mais especifico pro mais generico, e cada trecho ja
  casado e apagado antes do proximo passar.

  Sem isso, "R$ 4.200,00" era lido como 4200 E como 200 — o \d{3,} pegava o
  "200" de dentro do numero. O detector entao acusava invencao de "200"
  numa mensagem que so repetia o valor do consultor, e o rascunho correto
  era recusado. Um detector que grita a toa e pior que nenhum: ninguem
  olha mais pra ele.
*/
export function numerosDeRisco(texto) {
  const achados = new Set();
  let restante = texto ?? "";

  for (const padrao of PADROES) {
    const re = padrao instanceof RegExp ? padrao : padrao.re;
    const taxa = padrao.taxa === true;

    restante = restante.replace(new RegExp(re.source, re.flags), (trecho) => {
      const c = canonico(trecho, { taxa });
      if (c) achados.add(c);
      // Espacos no lugar: preserva as posicoes e impede rematch parcial.
      return " ".repeat(trecho.length);
    });
  }

  return [...achados];
}

/*
  Troca os numeros do exemplo por marcadores. O modelo continua vendo a forma
  da frase — "consegui liberar VALOR pra voce, em PRAZOx de PARCELA" — e para
  de ter digito pra copiar.

  Sao palavras, nao sublinhados. Com "___" o modelo de 3B copiava a lacuna
  literal e o cliente receberia "consegui liberar R$ ___ pra voce". Palavra
  em caixa alta ele trata como variavel e substitui.
*/
export const MARCADORES = ["VALOR", "PRAZO", "PARCELA", "TAXA"];

export function mascarar(texto) {
  return (texto ?? "")
    .replace(/r\$\s*[\d.,]+/gi, "VALOR")
    .replace(/\b\d{2,3}\s*(?:x|vezes|parcelas|meses)\b/gi, "PRAZOx")
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, "TAXA")
    .replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g, "VALOR")
    .replace(/\b\d+,\d{2}\b/g, "PARCELA")
    .replace(/\b\d{3,}\b/g, "VALOR");
}

/* Rede de seguranca: marcador que sobrou no rascunho nao pode ir pro cliente. */
export function sobrouMarcador(texto) {
  return (
    /\b(VALOR|PRAZO|PARCELA|TAXA)\b/.test(texto ?? "") || /_{2,}/.test(texto ?? "")
  );
}

/*
  Devolve os numeros que aparecem no rascunho e NAO aparecem no que o
  consultor escreveu nem na pergunta do cliente. Lista vazia = pode enviar.
*/
export function conferir(rascunho, ...fontesPermitidas) {
  const permitidos = new Set();
  for (const fonte of fontesPermitidas) {
    numerosDeRisco(fonte).forEach((n) => permitidos.add(n));
  }
  return numerosDeRisco(rascunho).filter((n) => !permitidos.has(n));
}
