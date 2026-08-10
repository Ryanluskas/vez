/*
  ============================================================================
  O FUNIL E O FOLLOW-UP

  O que mais faz o consultor perder venda não é resposta ruim: é cliente que
  some no meio e ninguém cobra. Este arquivo cuida disso.

  Nenhuma mensagem daqui tem número. São lembretes — "conseguiu separar os
  documentos?" — e é por isso que elas podem sair sozinhas sem furar a regra
  de ouro. Valor continua sendo assunto exclusivamente seu.
  ============================================================================
*/

export const ETAPAS = [
  "novo",
  "conversando",
  "aguardando_documentos",
  "documentos_recebidos",
  "em_analise",
  "fechado",
  "perdido",
];

export const ROTULO_DA_ETAPA = {
  novo: "Novo",
  conversando: "Conversando",
  aguardando_documentos: "Esperando documentos",
  documentos_recebidos: "Documentos recebidos",
  em_analise: "Em análise",
  fechado: "Fechado",
  perdido: "Perdido",
};

/* Só estas duas esfriam. "Em análise" depende do banco, não do cliente. */
const ETAPAS_QUE_ESFRIAM = ["conversando", "aguardando_documentos"];

const HORA = 60 * 60 * 1000;

/*
  Intervalo crescente. A primeira cobrança é rápida porque cliente esquece
  mesmo; da segunda em diante, espaça — insistir de hora em hora não
  acelera nada e queima o consultor.
*/
const ESPERA = {
  conversando: [4 * HORA, 24 * HORA, 72 * HORA],
  aguardando_documentos: [6 * HORA, 24 * HORA, 72 * HORA],
};

export const MAXIMO_DE_FOLLOWUPS = 3;

/*
  Nada sai antes das 8h nem depois das 20h. Mandar mensagem pra aposentado
  às 4 da manhã é o jeito mais rápido de ser bloqueado — e o motor fica
  ligado a noite inteira na máquina do consultor.
*/
export function horarioDecente(agora = new Date()) {
  const h = agora.getHours();
  return h >= 8 && h < 20;
}

function primeiroNome(nome) {
  if (!nome) return null;
  return nome.trim().split(/\s+/)[0];
}

/*
  Os textos. Curtos, sem cobrança agressiva, e o terceiro já se despede —
  quem não respondeu três vezes não quer ser perseguido, quer ser deixado
  em paz com a porta aberta.
*/
const TEXTOS = {
  aguardando_documentos: [
    (n) =>
      `Oi${n ? ` ${n}` : ""}, tudo bem? Conseguiu separar os documentos? Assim que me mandar eu já dou andamento aqui.`,
    (n) =>
      `${n ? `${n}, p` : "P"}assando pra lembrar dos documentos. Qualquer dúvida pode me chamar ou me ligar!`,
    (n) =>
      `${n ? `${n}, v` : "V"}ou deixar sua proposta guardada aqui. Quando quiser retomar é só me chamar!`,
  ],
  conversando: [
    (n) => `Oi${n ? ` ${n}` : ""}, ficou alguma dúvida sobre o que conversamos?`,
    (n) =>
      `${n ? `${n}, t` : "T"}udo bem? Qualquer dúvida sobre a proposta é só me chamar que eu te explico.`,
    (n) =>
      `${n ? `${n}, v` : "V"}ou deixar guardado aqui. Quando fizer sentido pra você, é só me chamar!`,
  ],
};

/*
  Decide se esta conversa merece uma cobrança agora.
  Devolve { seguir: false } ou { seguir: true, texto, tentativa }.
*/
export function decidirFollowup(conversa, agora = new Date()) {
  const naoSeguir = { seguir: false };

  if (!conversa.atender || !conversa.seguir) return naoSeguir;
  if (!ETAPAS_QUE_ESFRIAM.includes(conversa.etapa)) return naoSeguir;

  /*
    A bola esta com a gente, nao com o cliente: ou ele fez uma pergunta que
    esta na Fila esperando o consultor, ou ja existe rascunho pra aprovar.
    Cobrar alguem que esta esperando VOCE e o pior tipo de follow-up.
  */
  if (conversa.estagio === "aguardando_voce") return naoSeguir;
  if (conversa.estagio === "rascunho_pronto") return naoSeguir;
  if ((conversa.followups_enviados ?? 0) >= MAXIMO_DE_FOLLOWUPS) return naoSeguir;
  if (!horarioDecente(agora)) return naoSeguir;

  // Sem nunca ter recebido nada, nao ha o que cobrar.
  const ultimaDoCliente = conversa.ultima_recebida_em
    ? new Date(conversa.ultima_recebida_em).getTime()
    : null;
  if (!ultimaDoCliente) return naoSeguir;

  const tentativa = conversa.followups_enviados ?? 0;
  const espera = ESPERA[conversa.etapa][tentativa];

  /*
    O relogio conta a partir do que veio depois: a ultima palavra do cliente
    ou a ultima cobranca nossa. Sem isso, as tres cobrancas sairiam quase
    juntas no primeiro ciclo.
  */
  const ultimoFollowup = conversa.ultimo_followup_em
    ? new Date(conversa.ultimo_followup_em).getTime()
    : 0;
  const marcoZero = Math.max(ultimaDoCliente, ultimoFollowup);

  if (agora.getTime() - marcoZero < espera) return naoSeguir;

  const texto = TEXTOS[conversa.etapa][tentativa](primeiroNome(conversa.nome));
  return { seguir: true, texto, tentativa: tentativa + 1 };
}

/* Aviso que o motor manda pro WhatsApp do proprio consultor. */
export function avisoDeDocumento(conversa) {
  const quem = conversa.nome ?? conversa.telefone;
  return `📄 ${quem} mandou documento.`;
}
