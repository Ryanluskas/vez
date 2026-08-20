import fsSync from "node:fs";

/*
  ============================================================================
  O MODO ORIGINAL SOBREVIVE A UM KILL

  Os testes de ponta a ponta trocam o modo do agente para 'autonomo' e
  devolvem no fim. O `finally` cobre erro e saída normal — não cobre o
  processo sendo morto.

  E foi morto, mais de uma vez. Interrompi uma rodada no meio, o modo ficou
  'autonomo', e a rodada seguinte leu esse valor como se fosse o original.
  Duas execuções e a conta do consultor fica em modo autônomo
  permanentemente, por causa de um teste — respondendo cliente de verdade
  sem ninguém ter pedido.

  A anotação em arquivo resolve: se ela existe quando o teste começa, é
  porque a rodada anterior não terminou, e o valor certo está nela.

  Isto morava dentro de `conversa.js` e o `ademar.js` não tinha. Bastou o
  ademar rodar depois de um conversa.js morto pra ele "restaurar" o modo
  autônomo como se fosse o original — que foi exatamente o que aconteceu.
  Proteção que só um dos testes tem não é proteção.
  ============================================================================
*/
const ANOTACAO = new URL("./_modo-original.json", import.meta.url);

export function guardarModoOriginal(prefs) {
  fsSync.writeFileSync(ANOTACAO, JSON.stringify(prefs));
}

export function modoAnotado() {
  try {
    return JSON.parse(fsSync.readFileSync(ANOTACAO, "utf8"));
  } catch {
    return null;
  }
}

export function esquecerAnotacao() {
  try {
    fsSync.rmSync(ANOTACAO, { force: true });
  } catch {
    /* sem a anotação o fallback é o que já está no banco */
  }
}

/*
  O modo que o teste tem que devolver no fim.

  A anotação ganha do banco: se ela existe, o banco está sujo por uma
  rodada que não terminou.
*/
export function modoParaRestaurar(prefsDoBanco) {
  const anotado = modoAnotado();
  const original = anotado ?? prefsDoBanco ?? { modo: "manual", categorias: [] };
  guardarModoOriginal(original);
  return original;
}
