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
  /r\$\s*[\d.,]+/gi,
  /\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g,
  /\b\d+,\d{2}\b/g,
  /\b\d{2,3}\s*(?:x|vezes|parcelas|meses)\b/gi,
  /\b\d+\s*%/g,
  /\b\d{3,}\b/g,
];

/*
  "R$ 6.240,00", "6240,00" e "6.240" sao o MESMO numero. Sem normalizar,
  a conferencia acusa a toa toda vez que o modelo formata diferente.
*/
export function canonico(bruto) {
  let s = String(bruto).replace(/[^\d.,]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/\.(?=\d{3}\b)/g, "");

  const n = Number(s);
  if (!Number.isFinite(n) || n < 10) return null;
  return String(n);
}

export function numerosDeRisco(texto) {
  const achados = new Set();
  for (const padrao of PADROES) {
    for (const m of (texto ?? "").matchAll(padrao)) {
      const c = canonico(m[0]);
      if (c) achados.add(c);
    }
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
    .replace(/\b\d+\s*%/g, "TAXA")
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
