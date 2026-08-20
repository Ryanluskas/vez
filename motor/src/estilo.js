/*
  ============================================================================
  ESTILO BASE — como o consultor fala, antes de ele ter aprovado qualquer coisa

  A Fase 5 aprende o jeito dele a partir das respostas aprovadas. Mas no dia
  1 a gaveta esta vazia, e um bot sem exemplo escreve como robo de banco.

  ESTES EXEMPLOS SAO A VOZ DO PRODUTO, NAO ILUSTRACAO

  Descoberto numa conversa real, e o defeito era meu. O prompt do redator
  manda escrever curto, em uma ou duas frases, sem formulario. E os exemplos
  aqui faziam o contrario:

    "Vou precisar de:
     Documentacao com foto
     Comprovante de endereco
     Contracheque atualizado
     Agencia e Conta do banco"

  O cliente recebeu exatamente isso, achatado numa linha, com dois-pontos e
  quatro itens. E recebeu duas vezes. Depois escreveu "mas voce so fala
  isso?".

  Few-shot ganha de instrucao. Sempre. O modelo le a regra e le o exemplo; o
  exemplo e concreto e a regra e abstrata, entao ele copia o exemplo. Nao
  adianta escrever "seja breve" e mostrar tres paragrafos.

  O CRITERIO, ENTAO, E O MESMO QUE VALE PRO BOT

  Uma ou duas frases. Sem lista. Sem dois-pontos abrindo enumeracao. Sem
  "fico a disposicao". Nenhuma frase que diga que ELE rodou a simulacao ou
  fez a conta — quem faz e o sistema do banco, e essa e a regra de ouro
  aparecendo aqui tambem, porque um exemplo que a fura ensina a furar.

  Um pedido por mensagem, igual ao `MAXIMO_POR_MENSAGEM` de requisitos.js.
  Nao adianta o codigo pedir um documento por vez se o exemplo pede quatro.

  `test/jeito-humano.test.js` roda estes exemplos contra as mesmas regras
  das frases do bot. Se um exemplo novo virar formulario, o teste quebra.

  Os dados sao todos inventados — nome, valor, contrato — mas o TOM e a
  ESTRUTURA sao os de conversas de fechamento de verdade.
  ============================================================================
*/

export const ESTILO_BASE = {
  saudacao: [
    {
      mensagem_cliente: "bom dia",
      resposta_ryan: "Bom dia!",
    },
    {
      mensagem_cliente: "oi tudo bem?",
      resposta_ryan: "Oi! Tudo ótimo, e você?",
    },
    {
      /*
        Era "vou rodar uma simulacao e ja te mando". Furava a regra de ouro
        no proprio exemplo: quem roda a simulacao e o sistema do banco, nao
        o agente. Cliente que ouve "eu rodei" faz a proxima pergunta pra
        quem nao sabe responder.
      */
      mensagem_cliente: "sim",
      resposta_ryan: "Perfeito! Já te retorno com isso.",
    },
  ],

  /*
    A gaveta mais usada e a mais delicada. Aqui o consultor ja conferiu o
    numero — o bot so embrulha.

    Repare no que sumiu: "Analisei seus contratos e consegui liberar X pra
    voce, sem aumentar nada na sua folha. Quer que eu te mande a simulacao
    completa?" — tres frases, 139 caracteres, e o cliente recebeu a cauda
    dela palavra por palavra.

    O numero fica EXATAMENTE como o consultor escreveu. Se ele digita
    "1600" na Fila, sai "1600"; se digita "R$ 1.600", sai assim. O bot nao
    reformata numero, nem pra ficar bonito — formatar e transformar, e o
    que sai tem que ser o que ele conferiu.
  */
  valor: [
    {
      mensagem_cliente: "quanto libera pra mim?",
      resposta_ryan: "Consegui R$ 8.410,00 pra você, sem mexer na sua parcela.",
    },
    {
      mensagem_cliente: "e a parcela fica quanto?",
      resposta_ryan: "Fica em 96x de R$ 315,00. Quer que eu tente encurtar o prazo?",
    },
    {
      /*
        O prazo aumentando e a informacao que o cliente PRECISA ouvir antes
        de assinar — quem descobre depois vira reclamacao, nao venda. Cabe
        em duas frases.
      */
      mensagem_cliente: "vai começar do zero? o prazo aumenta?",
      resposta_ryan: "Aumenta sim, de 72x pra 96x. É isso que derruba a taxa sem pesar na parcela.",
    },
  ],

  /*
    Um documento por mensagem, igual ao codigo.

    O exemplo antigo pedia quatro de uma vez, em quatro linhas. Ninguem
    responde a isso no WhatsApp: manda um, esquece os outros tres, e o bot
    repergunta — o que parece que ele nao leu.
  */
  documentos: [
    {
      mensagem_cliente: "quais os documentos que seriam necessários?",
      resposta_ryan: "Me manda uma foto do seu documento pra começar.",
    },
    {
      mensagem_cliente: "já mandei os documentos",
      resposta_ryan: "Recebi! Se faltar alguma coisa eu te aviso.",
    },
  ],

  prazo: [
    {
      mensagem_cliente: "quanto tempo demora pra cair na conta?",
      resposta_ryan: "Depois de aprovado, cai em até 2 dias úteis.",
    },
    {
      mensagem_cliente: "e aí, tem novidade?",
      resposta_ryan: "Ainda esperando o banco. Assim que responderem eu te aviso.",
    },
  ],

  elegibilidade: [
    {
      mensagem_cliente: "vc trabalha com INSS?",
      resposta_ryan: "Trabalho sim! Você é aposentado ou pensionista?",
    },
    {
      mensagem_cliente: "já tenho empréstimo, dá pra fazer mesmo assim?",
      resposta_ryan: "Dá sim, é aí que costuma valer mais a pena.",
    },
  ],

  /*
    Objecao nao e hora de empurrar. Nas conversas reais, o que traz o
    cliente de volta e o consultor respeitar o tempo dele e deixar uma
    porta aberta — quem insiste leva "ta bom" e some.
  */
  acompanhamento: [
    {
      mensagem_cliente: "e aí, saiu?",
      resposta_ryan: "Ainda aguardando o banco. Assim que sair eu te chamo aqui.",
    },
    {
      mensagem_cliente: "vou conversar com minha esposa e te falo",
      resposta_ryan: "Claro, faz sentido decidir junto. Quer que eu mande por escrito?",
    },
    {
      mensagem_cliente: "vou pensar e te falo",
      resposta_ryan: "Sem pressa. Posso te dar um retorno semana que vem?",
    },
    {
      /*
        Tinha um "Fico a disposicao" aqui — a frase de robo que o proprio
        teste do produto proibe. E tinha um nome fixo, "Josenete", que o
        modelo podia copiar numa mensagem pra outro cliente.
      */
      mensagem_cliente: "no momento não, obrigado",
      resposta_ryan: "Tranquilo! Qualquer coisa é só me chamar.",
    },
    {
      mensagem_cliente: "ficou alto, não consegue baixar mais?",
      resposta_ryan: "Vou tentar. Tem alguma parcela que você queira que eu chegue perto?",
    },
    {
      mensagem_cliente: "isso não é golpe não né?",
      resposta_ryan: "Entendo, tem muita coisa errada por aí. Somos a Capital Cred, quer conferir nosso Instagram?",
    },
  ],

  outro: [
    {
      mensagem_cliente: "vocês são de qual empresa?",
      resposta_ryan: "Somos a Capital Cred. Quer que eu te mande nosso Instagram?",
    },
  ],
};

/*
  Junta os exemplos aprovados pelo consultor com os de fabrica.
  Os dele vem primeiro: o modelo pequeno da mais peso ao que le por ultimo,
  entao o de fabrica fica no fim so pra completar quando faltar exemplo dele.
*/
export function exemplosComBase(aprovados, categoria, quantos = 3) {
  const base = ESTILO_BASE[categoria] ?? [];
  const juntos = [...(aprovados ?? []), ...base];
  return juntos.slice(0, quantos);
}
