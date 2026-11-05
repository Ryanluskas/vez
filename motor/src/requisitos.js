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
    pedido: "me manda uma foto do documento (RG ou CNH frente e verso)",
    peso: 5,
  },
  comprovante_endereco: {
    rotulo: "comprovante de endereço",
    pedido: "me manda um comprovante de endereço atualizado",
    peso: 6,
  },
  numero_contrato: {
    rotulo: "número do contrato",
    pedido: "me passa o(s) número(s) do(s) contrato(s) do Santander que vamos refinanciar",
    peso: 7,
  },
  conta_bancaria: {
    rotulo: "agência e conta",
    pedido: "me passa sua agência e conta",
    peso: 8,
  },
};

const PARA_SIMULAR = ["convenio", "banco", "contracheque", "margem"];
export const PARA_FECHAR = [
  "documento_foto",
  "comprovante_endereco",
  "contracheque",
  "margem",
  "numero_contrato",
];

const PARA_SIMULAR_EM_PROSPECCAO = [];

function exigidosPara(para, estado) {
  if (para === "fechar") return PARA_FECHAR;

  const emProspeccao =
    (estado?.origem === "prospeccao" || estado?.operacao === "capitalcred") &&
    ["prospeccao", "interesse", "simulacao"].includes(estado?.etapa_comercial ?? "interesse");

  return emProspeccao ? PARA_SIMULAR_EM_PROSPECCAO : PARA_SIMULAR;
}

/*
  UM pedido por mensagem.

  Era dois, e dois não cabem numa frase de WhatsApp. O resultado ficava
  assim: "pra eu conseguir te responder, você é aposentado/pensionista do
  INSS ou servidor público? e em qual banco está seu empréstimo hoje?" —
  140 caracteres, duas interrogações, cara de formulário.

  Ninguém responde a duas perguntas por mensagem no WhatsApp. Responde a
  primeira e ignora a segunda, e aí o bot pergunta a segunda de novo — o
  que parece que ele não leu.

  Uma pergunta, resposta, próxima pergunta. É como a conversa acontece.
*/
export const MAXIMO_POR_MENSAGEM = 1;

function jaTem(memoria, chave) {
  if (!memoria) return false;

  // Campos que moram em coluna própria.
  if (chave === "convenio") return !!memoria.convenio;
  if (chave === "banco") return !!memoria.banco;

  return memoria.coletado?.[chave]?.confirmado === true;
}

/*
  Troca os nomes de documento por "documento".

  "Extrato de margem" tem a palavra "margem", que é gatilho de dinheiro. Mas
  PEDIR o extrato — ou dizer "assim que você me mandar o extrato de margem"
  — não é falar do valor da margem: é falar de um papel, com o nome que o
  próprio código deu a ele.

  Isso importa porque o bot lê a própria conversa. Ele pede o extrato numa
  mensagem, e na seguinte o contexto já tem essa frase; qualquer resposta
  que a referencie era descartada pelo guarda. O cliente perguntava o prazo
  e recebia "vou verificar", porque a resposta mencionava um documento que o
  bot mesmo tinha pedido.

  Quem usa isto compara o ANTES e o DEPOIS: se tirar os rótulos faz o
  gatilho parar de disparar, o que travou era o nome do papel. Se continuar
  disparando, é dinheiro de verdade e não passa.
*/
export function semRotulosDeRequisito(texto) {
  let limpo = String(texto ?? "");
  for (const r of Object.values(REQUISITOS)) {
    limpo = limpo.replaceAll(r.rotulo, "documento");
  }
  return limpo;
}

/*
  Devolve o que falta, mais urgente primeiro.
  `objetivo` decide o tamanho da lista: quem só tirou uma dúvida não precisa
  mandar comprovante de endereço.
*/
export function queFalta(memoria, opcoes = {}) {
  const para = typeof opcoes === "string" ? opcoes : (opcoes?.para ?? "simular");
  /*
    A memoria carrega a etapa comercial junto. Quem abordou primeiro ja
    sabe o basico do cliente — pedir de novo e a conversa errada.
  */
  const exigidos = exigidosPara(para, memoria);
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

/*
  O cliente já recusou enviar este item? Se sim, nunca mais pedimos automaticamente.
*/
export function foiRecusado(memoria, chave) {
  if (!memoria || !chave) return false;
  if (memoria.recusas?.[chave]?.recusado === true) return true;
  if (Array.isArray(memoria.recusas) && memoria.recusas.some((r) => r?.item === chave || r === chave)) return true;
  if (memoria.perguntado?._recusas?.[chave]?.recusado === true) return true;
  if (Array.isArray(memoria.perguntado?._recusas) && memoria.perguntado._recusas.some((r) => r?.item === chave || r === chave)) return true;
  if (memoria.perguntado?.[chave]?.recusado === true) return true;
  return false;
}

/*
  Retorna o último requisito perguntado ao cliente (se houver).
*/
export function ultimoRequisitoPerguntado(memoria) {
  if (!memoria?.perguntado) return null;
  const ultimoChaves = memoria.perguntado._ultimo_pedido_chaves;
  if (Array.isArray(ultimoChaves) && ultimoChaves.length > 0 && REQUISITOS[ultimoChaves[0]]) {
    return ultimoChaves[0];
  }
  const candidatos = Object.entries(memoria.perguntado)
    .filter(([chave, val]) => {
      if (!REQUISITOS[chave]) return false;
      const vezes = typeof val === "number" ? val : (val?.vezes ?? 0);
      return vezes > 0;
    })
    .sort((a, b) => new Date(b[1]?.em ?? 0) - new Date(a[1]?.em ?? 0));
  return candidatos[0]?.[0] ?? null;
}

const DESISTIR_APOS = 2;

/*
  Monta UMA mensagem pedindo só o que falta, no máximo um item por vez, pulando
  o que já foi recusado pelo cliente ou pedido duas vezes sem resposta — insistir
  não traz o documento, traz bloqueio.

  Devolve null quando não há o que pedir, ou quando tudo que falta já foi
  recusado ou pedido demais: aí o caso é do consultor, não do bot.
*/
export function montarPedido(memoria, opcoes = {}) {
  const para = typeof opcoes === "string" ? opcoes : (opcoes?.para ?? "simular");
  const faltando = queFalta(memoria, { para }).filter(
    (chave) => !foiRecusado(memoria, chave) && quantasVezesPerguntei(memoria, chave) < DESISTIR_APOS
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
export function prontoPara(memoria, opcoes = {}) {
  const para = typeof opcoes === "string" ? opcoes : (opcoes?.para ?? "simular");
  return queFalta(memoria, { para }).length === 0;
}
