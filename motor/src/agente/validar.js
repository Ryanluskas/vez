import { ACOES } from "./decidir.js";
import { checarGatilhos } from "../gatilhos.js";
import { conferir, sobrouMarcador } from "../numeros.js";

/*
  ============================================================================
  O PORTEIRO

  Duas checagens diferentes, e a distinção importa:

    validarDecisao()  — a decisão faz sentido? Tem o que precisa pra rodar?
                        Roda ANTES de qualquer ação.

    validarTexto()    — este texto pode ir pro cliente?
                        Roda DEPOIS de escrever, ANTES de enviar.

  Regra da casa: nada aqui pergunta pra IA se a resposta da IA está boa.
  Modelo avaliando o próprio texto erra junto — se ele achou correto
  escrever, vai achar correto aprovar. Tudo aqui é determinístico.

  Reprovar nunca significa "envia mesmo assim": significa que o consultor
  entra. Falhar para o lado de chamar gente é sempre o lado barato.
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
  O texto pode sair?

  `fontesPermitidas` são os lugares de onde um número pode legitimamente ter
  vindo: a resposta do consultor, a pergunta do cliente, o manual da
  operação. Número que não está em nenhuma delas foi inventado agora.
*/
export function validarTexto(texto, { permitirNumeros = false, fontesPermitidas = [] } = {}) {
  if (!texto || !texto.trim()) {
    return { ok: false, motivo: "texto vazio" };
  }

  if (texto.trim().length < 12) {
    return { ok: false, motivo: "resposta curta demais pra ser resposta" };
  }

  // "Não sei" é coisa que consultor não diz — ele verifica e volta.
  if (/n[aã]o[\s_]*sei/i.test(texto)) {
    return { ok: false, motivo: "a IA disse que não sabe" };
  }

  // Marcador de exemplo que vazou: o cliente receberia "liberar R$ VALOR".
  if (sobrouMarcador(texto)) {
    return { ok: false, motivo: "sobrou marcador de exemplo no texto" };
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
    return { ok: false, motivo: `a IA escreveu sobre valor (${motivo})` };
  }

  return { ok: true };
}
