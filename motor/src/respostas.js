import { REQUISITOS } from "./requisitos.js";
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

function comNome(nome, frase) {
  return nome ? `${nome}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}` : frase;
}

/* Varia pra não parecer robô repetindo a mesma linha o dia inteiro. */
function umaDelas(lista, semente = Date.now()) {
  return lista[Math.abs(semente) % lista.length];
}

/* ------------------------------------------------------------------
   Saudação
------------------------------------------------------------------ */

const SAUDACOES = [
  "Oi! Tudo bem? Como posso te ajudar?",
  "Oi! Tudo bom por aí? Me conta o que você precisa.",
  "Oi! Tudo certo? Em que posso ajudar?",
];

const AGRADECIMENTOS = [
  "Imagina! Qualquer coisa é só me chamar.",
  "Tô à disposição! Precisando, me chama.",
  "Por nada! Se precisar de mais alguma coisa, é só falar.",
];

const ELE_AGRADECEU = /\b(?:obrigad[oa]|vlw|valeu|agradec|show|ótimo|otimo|perfeito|legal|beleza|blz|ok|entendi|certo)\b/i;

export function saudacao(mensagemCliente, nomeCliente, semente) {
  const lista = ELE_AGRADECEU.test(mensagemCliente ?? "") ? AGRADECIMENTOS : SAUDACOES;
  return comNome(nomeCliente, umaDelas(lista, semente));
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
      "Recebi seus documentos, obrigado! Vou analisar aqui e já te retorno."
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
  O texto já vem montado de `requisitos.js`, que é código. Aqui só embrulha
  numa frase inteira — é o mesmo texto que já sai hoje quando o redator
  falha, agora como primeira opção em vez de último recurso.
*/
export function pedirOQueFalta(pedido, nomeCliente) {
  if (!pedido?.texto) return null;
  return comNome(nomeCliente, `Pra eu conseguir te responder, ${pedido.texto}. Pode ser?`);
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
const VOU_VERIFICAR = [
  "Recebi sua mensagem! Vou verificar isso aqui e já te respondo.",
  "Anotei aqui! Deixa eu confirmar uma coisa e já te retorno.",
  "Recebi! Vou dar uma olhada e te respondo em seguida.",
];

export function vouVerificar(nomeCliente, semente) {
  return comNome(nomeCliente, umaDelas(VOU_VERIFICAR, semente));
}

/* ------------------------------------------------------------------
   A escolha
------------------------------------------------------------------ */

/*
  Dada a situação, existe resposta determinística? Devolve o texto ou null.

  `null` NÃO significa falha — significa que este caso precisa de linguagem
  de verdade, e quem chamou decide o que fazer (tentar a IA, ou mandar pra
  Fila com o aviso).

  A ordem é do mais específico pro mais genérico. `vouVerificar` fica de
  fora de propósito: ele não é resposta, é aviso, e quem decide usá-lo é o
  orquestrador quando tudo o mais falhou.
*/
export function respostaDeterministica({
  categoria,
  mensagemCliente,
  nomeCliente = null,
  pedido = null,
  fatosNovos = null,
  semente,
}) {
  let texto = null;

  if (categoria === "saudacao") {
    texto = saudacao(mensagemCliente, nomeCliente, semente);
  } else if (pedido?.texto) {
    texto = pedirOQueFalta(pedido, nomeCliente);
  } else if (fatosNovos && (fatosNovos.convenio || fatosNovos.banco)) {
    texto = informacaoRecebida(fatosNovos, nomeCliente);
  }

  return conferido(texto);
}

/*
  A última porta deste arquivo. Frase que eu escrevi e que ainda assim soa
  como dinheiro não sai — nem que eu tenha escrito com a melhor das
  intenções. O texto de hoje não é o texto de daqui a seis meses.
*/
/*
  Os rótulos que o próprio `requisitos.js` produz. "Extrato de margem" tem
  a palavra "margem", que é gatilho de dinheiro — e é assim que o produto
  já pede esse documento hoje.

  A distinção que importa: PEDIR o extrato de margem não é falar de margem.
  Uma é uma frase de código pedindo um papel; a outra seria o bot dizendo
  quanto o cliente tem. O que separa as duas, aqui, é a procedência — este
  texto veio de `REQUISITOS`, não de modelo nenhum.
*/
const ROTULOS_DE_REQUISITO = Object.values(REQUISITOS).map((r) => r.rotulo);

export function conferido(texto) {
  if (!texto || !texto.trim()) return null;

  /*
    Número é o corte que não tem exceção. Nenhuma frase deste arquivo
    precisa de dígito — nem a que lista o que falta.
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
