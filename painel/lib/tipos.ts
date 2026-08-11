/* Espelho dos tipos do banco (ver banco/01_tabelas.sql). */

export type EstagioDaConversa =
  | "aguardando_bot"
  | "aguardando_voce"
  | "rascunho_pronto"
  | "respondido";

export type Conversa = {
  id: string;
  user_id: string;
  telefone: string;
  nome: string | null;
  estagio: EstagioDaConversa;
  ultima_mensagem: string | null;
  atualizado_em: string;
  /* false = contato silenciado: o bot grava as mensagens mas não pensa. */
  atender: boolean;
  /* Onde o cliente está na venda — independente do estágio da mensagem. */
  etapa: Etapa;
  /* false = nunca mandar follow-up nesta conversa. */
  seguir: boolean;
  followups_enviados: number;
  /* Quem falou por último. 'recebida' = a bola está com você. */
  ultima_direcao: "recebida" | "enviada" | null;
};

/*
  Funil de venda. Não confundir com `estagio`, que é o processamento da
  mensagem: um cliente pode estar "esperando documentos" (etapa) e ao mesmo
  tempo "travado com você" (estágio) porque perguntou o valor no meio.
*/
export type Etapa =
  | "novo"
  | "conversando"
  | "aguardando_documentos"
  | "documentos_recebidos"
  | "em_analise"
  | "fechado"
  | "perdido";

export const ETAPAS: Etapa[] = [
  "novo",
  "conversando",
  "aguardando_documentos",
  "documentos_recebidos",
  "em_analise",
  "fechado",
  "perdido",
];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  novo: "Novo",
  conversando: "Conversando",
  aguardando_documentos: "Esperando documentos",
  documentos_recebidos: "Documentos recebidos",
  em_analise: "Em análise",
  fechado: "Fechado",
  perdido: "Perdido",
};

export type Mensagem = {
  id: string;
  user_id: string;
  id_conversa: string;
  direcao: "recebida" | "enviada";
  texto: string;
  criado_em: string;
};

export type Pendencia = {
  id: string;
  user_id: string;
  id_conversa: string;
  pergunta: string;
  contexto: string | null;
  status: "aberta" | "respondida";
  criado_em: string;
};

export type Rascunho = {
  id: string;
  user_id: string;
  id_conversa: string;
  texto_sugerido: string;
  status: "pendente" | "aprovado" | "descartado";
  criado_em: string;
};

export type RespostaBoa = {
  id: string;
  user_id: string;
  categoria: string;
  mensagem_cliente: string;
  resposta_ryan: string;
  criado_em: string;
};

/* Rotulos de estagio em portugues de gente, num lugar so. */
export const ROTULO_DO_ESTAGIO: Record<EstagioDaConversa, string> = {
  aguardando_bot: "Bot atendendo",
  aguardando_voce: "Travada com você",
  rascunho_pronto: "Rascunho pronto",
  respondido: "Respondido",
};
