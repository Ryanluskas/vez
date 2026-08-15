/*
  ============================================================================
  O QUE FALTA PRA CONTINUAR

  Esta é a peça que faz o bot perguntar só o que falta, e é código puro —
  sem IA. Regra de negócio não é interpretação: se o cliente já disse que é
  do INSS, não existe modelo de linguagem que precise decidir se pergunta de
  novo. Decidir aqui também torna isso testável e independente de modelo.

  A REGRA QUE MUDA O PRODUTO (item 7 do brief):

    Cliente pergunta "quanto libera?" e ainda falta documento
      → NÃO chama o consultor. Pergunta o documento ao cliente.

    Cliente pergunta "quanto libera?" e já temos tudo
      → aí sim chama o consultor, porque só ele roda a simulação.

  Perguntar pelo que falta não fura a regra de ouro: a mensagem que sai é
  uma pergunta, não um número. Ela passa pelas mesmas validações de sempre.
  ============================================================================
*/

/*
  Cada requisito sabe se perguntar. O texto é curto e direto porque vai
  junto com outros numa única mensagem — ninguém responde a um formulário
  de cinco perguntas no WhatsApp.
*/
export const REQUISITOS = {
  convenio: {
    rotulo: "convênio",
    pedido: "você é aposentado/pensionista do INSS ou servidor público?",
    // Sem isso não dá nem pra saber se atendemos.
    peso: 1,
  },
  banco: {
    rotulo: "banco",
    pedido: "em qual banco está seu empréstimo hoje?",
    peso: 2,
  },
  contracheque: {
    rotulo: "contracheque",
    pedido: "me manda seu contracheque atualizado",
    peso: 3,
  },
  margem: {
    rotulo: "extrato de margem",
    pedido: "me manda o extrato de margem",
    peso: 4,
  },
  documento_foto: {
    rotulo: "documento com foto",
    pedido: "me manda um documento com foto",
    peso: 5,
  },
  comprovante_endereco: {
    rotulo: "comprovante de endereço",
    pedido: "me manda um comprovante de endereço",
    peso: 6,
  },
  conta_bancaria: {
    rotulo: "agência e conta",
    pedido: "me passa sua agência e conta",
    peso: 7,
  },
};

/*
  O que cada situação exige. Listas curtas de propósito: pedir sete coisas
  de uma vez faz o cliente sumir.
*/
const PARA_SIMULAR = ["convenio", "banco", "contracheque", "margem"];
const PARA_FECHAR = [
  ...PARA_SIMULAR,
  "documento_foto",
  "comprovante_endereco",
  "conta_bancaria",
];

/* Quantos pedidos cabem numa mensagem sem virar formulário. */
const MAXIMO_POR_MENSAGEM = 2;

function jaTem(memoria, chave) {
  if (!memoria) return false;

  // Campos que moram em coluna própria.
  if (chave === "convenio") return !!memoria.convenio;
  if (chave === "banco") return !!memoria.banco;

  return memoria.coletado?.[chave]?.confirmado === true;
}

/*
  Devolve o que falta, mais urgente primeiro.
  `objetivo` decide o tamanho da lista: quem só tirou uma dúvida não precisa
  mandar comprovante de endereço.
*/
export function queFalta(memoria, { para = "simular" } = {}) {
  const exigidos = para === "fechar" ? PARA_FECHAR : PARA_SIMULAR;
  return exigidos
    .filter((chave) => !jaTem(memoria, chave))
    .sort((a, b) => REQUISITOS[a].peso - REQUISITOS[b].peso);
}

/*
  Já perguntamos isso e o cliente não respondeu? Devolve quantas vezes.
  É o que impede o bot de repetir a mesma pergunta pra sempre.
*/
export function quantasVezesPerguntei(memoria, chave) {
  return memoria?.perguntado?.[chave]?.vezes ?? 0;
}

const DESISTIR_APOS = 2;

/*
  Monta UMA mensagem pedindo só o que falta, no máximo dois itens, pulando
  o que já foi pedido duas vezes sem resposta — insistir na terceira não
  traz o documento, traz bloqueio.

  Devolve null quando não há o que pedir, ou quando tudo que falta já foi
  pedido demais: aí o caso é do consultor, não do bot.
*/
export function montarPedido(memoria, { para = "simular" } = {}) {
  const faltando = queFalta(memoria, { para }).filter(
    (chave) => quantasVezesPerguntei(memoria, chave) < DESISTIR_APOS
  );

  if (faltando.length === 0) return null;

  const agora = faltando.slice(0, MAXIMO_POR_MENSAGEM);
  const pedidos = agora.map((c) => REQUISITOS[c].pedido);

  const texto =
    pedidos.length === 1
      ? pedidos[0]
      : `${pedidos.slice(0, -1).join(", ")} e ${pedidos[pedidos.length - 1]}`;

  return { chaves: agora, texto, faltamAinda: faltando.length - agora.length };
}

/*
  Tudo que era preciso já está na mão?
  É o que autoriza o agente a escalar pro consultor em vez de ficar pedindo
  documento — e o que garante que o consultor só é chamado quando de fato
  só ele resolve.
*/
export function prontoPara(memoria, { para = "simular" } = {}) {
  return queFalta(memoria, { para }).length === 0;
}
