import { montarPedido, prontoPara } from "../requisitos.js";

/*
  ============================================================================
  A DECISÃO

  Função pura: recebe um retrato da situação, devolve uma decisão. Não lê
  banco, não chama IA, não envia nada. Por isso dá pra testar cada caminho
  em milissegundos, e por isso ela é confiável.

  POR QUE A DECISÃO NÃO É DO MODELO

  O brief pedia um agente devolvendo {action, confidence, ...} em JSON. Eu
  medi o llama3.2:3b nesta operação: ele mistura "R$" com "%", copia número
  de exemplo e responde "Não sei" pro cliente. Pedir a ele que escolha entre
  seis ações e calibre uma confiança seria construir a parte mais crítica do
  produto sobre a parte menos confiável dele.

  Então: a decisão é código, e o modelo faz o que ele faz bem — entender
  linguagem (classificar, extrair) e escrever. É o item 27 do próprio brief.

  SOBRE `confianca`

  Não é o modelo se auto-avaliando — isso seria número decorativo. É quão
  determinística foi a decisão: 1.0 quando saiu de regra rígida, menor
  quando dependeu do classificador. É isso que o modo ASSISTIDO usa de
  corte, e é uma medida honesta.
  ============================================================================
*/

export const ACOES = {
  RESPONDER: "responder",
  PERGUNTAR_CLIENTE: "perguntar_cliente",
  PEDIR_AO_CONSULTOR: "pedir_ao_consultor",
  AGUARDAR: "aguardar",
  SILENCIAR: "silenciar",
};

/* Quantas mensagens seguidas o bot pode mandar sem o cliente responder. */
const MONOLOGO_MAXIMO = 3;

/*
  Quantas vezes a mesma conversa pode ir parar na mão do consultor antes de
  o bot admitir que não vai resolver aquilo. Na quarta, o caso não é de
  informação faltando — ou o cliente quer algo que a operação não faz, ou
  tem ruído que só gente desfaz. Insistir vira ping-pong entre bot e humano.
*/
const ESCALONAMENTOS_MAXIMOS = 3;

/*
  Quão determinística foi a decisão.
    1.00 regra rígida — não passou por modelo nenhum
    0.90 estado da conversa — congelada, silenciada, pendência aberta
    0.80 classificador acertou uma categoria conhecida
    0.50 categoria "outro": o modelo não soube encaixar
*/
const CONFIANCA = {
  REGRA: 1.0,
  ESTADO: 0.9,
  CLASSIFICADOR: 0.8,
  INCERTO: 0.5,
};

function contarMonologo(ultimasMensagens = []) {
  let seguidas = 0;
  for (let i = ultimasMensagens.length - 1; i >= 0; i--) {
    if (ultimasMensagens[i].direcao !== "enviada") break;
    seguidas++;
  }
  return seguidas;
}

/*
  A ordem importa. Cada regra é uma porta: se fecha, as de baixo nem são
  consultadas. As primeiras são de estado (baratas e certas), as últimas
  dependem do classificador.
*/
export function decidir(retrato) {
  const {
    conversa = {},
    memoria = null,
    classificacao = null,
    ultimasMensagens = [],
  } = retrato ?? {};

  /* ---- 1. Não é cliente ---- */
  if (conversa.atender === false) {
    return {
      acao: ACOES.SILENCIAR,
      confianca: CONFIANCA.ESTADO,
      motivo: "contato silenciado por você",
    };
  }

  /*
    ---- 1b. Conversa que você assumiu ----
    O freio de loop pegou aqui antes (ou você assumiu na mão). O bot grava
    e não decide mais nada nesta conversa até você devolver no painel.
  */
  if (conversa.soVoce) {
    return {
      acao: ACOES.AGUARDAR,
      confianca: CONFIANCA.ESTADO,
      motivo: "esta conversa está com você; só gravei",
    };
  }

  /* ---- 2. A bola já está com o consultor ---- */
  if (conversa.estagio === "aguardando_voce" || conversa.temPendenciaAberta) {
    return {
      acao: ACOES.AGUARDAR,
      confianca: CONFIANCA.ESTADO,
      motivo: "já existe pergunta esperando você nesta conversa",
    };
  }

  /*
    ---- 3. Anti-loop ----
    O bot falou três vezes seguidas e o cliente não respondeu. Falar uma
    quarta não convence ninguém — ou a conversa morreu, ou o bot está
    perguntando algo que o cliente não sabe responder. Nos dois casos quem
    resolve é gente.
  */
  const monologo = contarMonologo(ultimasMensagens);
  if (monologo >= MONOLOGO_MAXIMO) {
    return {
      acao: ACOES.PEDIR_AO_CONSULTOR,
      confianca: CONFIANCA.ESTADO,
      motivo: `mandei ${monologo} mensagens seguidas sem resposta`,
      escalonamento: "sem_resposta",
    };
  }

  /*
    ---- 3b. Freio do ping-pong ----
    Já foi pra sua mão três vezes e voltou. O bot para de tentar e entrega
    a conversa: continua gravando tudo, mas não decide mais nada sozinho
    ali. É diferente de silenciar — silenciado é quem não é cliente; este
    é cliente demais.
  */
  if ((conversa.escalonamentos ?? 0) >= ESCALONAMENTOS_MAXIMOS) {
    return {
      acao: ACOES.PEDIR_AO_CONSULTOR,
      confianca: CONFIANCA.ESTADO,
      motivo: `já passou ${conversa.escalonamentos}x por você sem resolver — assuma esta`,
      escalonamento: "loop",
      assumirManual: true,
    };
  }

  if (!classificacao) {
    return {
      acao: ACOES.PEDIR_AO_CONSULTOR,
      confianca: CONFIANCA.ESTADO,
      motivo: "não consegui classificar a mensagem",
      escalonamento: "erro",
    };
  }

  const { categoria, precisaDoRyan, motivo, decidiuNaRegra } = classificacao;

  /* ---- 4. Assunto de dinheiro ---- */
  if (precisaDoRyan) {
    /*
      Aqui mora a autonomia. "Quanto libera?" sem contracheque não é
      pergunta pro consultor — é pergunta que ninguém pode responder
      ainda. Pedir o documento não fura a regra de ouro: sai uma
      pergunta, sem número.
    */
    const pedido = montarPedido(memoria);
    if (pedido) {
      return {
        acao: ACOES.PERGUNTAR_CLIENTE,
        confianca: decidiuNaRegra ? CONFIANCA.REGRA : CONFIANCA.CLASSIFICADOR,
        motivo: `falta ${pedido.chaves.join(" e ")} pra poder responder`,
        pedido,
        categoria: "documentos",
      };
    }

    return {
      acao: ACOES.PEDIR_AO_CONSULTOR,
      confianca: decidiuNaRegra ? CONFIANCA.REGRA : CONFIANCA.CLASSIFICADOR,
      motivo: motivo ?? "depende de um dado seu",
      categoria,
      escalonamento: decidiuNaRegra ? "valor" : "informacao_desconhecida",
      // Já temos tudo do cliente: o que falta é a simulação, que é sua.
      tudoColetado: prontoPara(memoria),
    };
  }

  /* ---- 5. O bot dá conta ---- */
  return {
    acao: ACOES.RESPONDER,
    confianca: categoria === "outro" ? CONFIANCA.INCERTO : CONFIANCA.CLASSIFICADOR,
    motivo: `pergunta de ${categoria}`,
    categoria,
  };
}

/*
  A decisão vira envio automático, ou vira rascunho esperando você?

  Isto é separado de `decidir` de propósito: a decisão é sobre O QUE fazer,
  esta é sobre QUEM confere antes. Trocar de modo não muda o que o bot
  pensa, só quanto ele pode agir sozinho.
*/
export const LIMIAR_ASSISTIDO = 0.8;

export function podeAgirSozinho(decisao, { modo, categoriasLiberadas = [] }) {
  // A categoria valor nunca sai sozinha, em modo nenhum. Quarta barreira.
  if (decisao.categoria === "valor") return false;

  if (modo === "manual") return false;

  const liberada = categoriasLiberadas.includes(decisao.categoria);
  if (!liberada) return false;

  if (modo === "assistido") return decisao.confianca >= LIMIAR_ASSISTIDO;
  if (modo === "autonomo") return true;

  return false;
}
