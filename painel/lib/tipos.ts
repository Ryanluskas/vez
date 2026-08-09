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
