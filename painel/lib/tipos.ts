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
  /*
    true = o bot só grava aqui. Ligado sozinho quando a mesma conversa volta
    três vezes pra sua mão sem sair do lugar; desligado só por você.
  */
  so_voce?: boolean;
  /* Motivo de perda quando a oportunidade não fecha (ex: sem margem, sem interesse). */
  motivo_perda?: string | null;
  /* Temperatura do lead calculada pelo funil comercial. */
  qualificacao?: "indefinida" | "fria" | "morna" | "quente" | "desqualificada";
  /* Conformidade LGPD e opt-out ativo */
  opt_out?: boolean;
  opt_out_em?: string | null;
  motivo_opt_out?: string | null;
  consentimento?: boolean;
  origem_contato?: string | null;
  observacoes?: string | null;
  origem?: string | null;
};

/*
  Funil de venda comercial CapitalCred (8 etapas) + compatibilidade legada.
*/
export type Etapa =
  | "novo_contato"
  | "primeiro_atendimento"
  | "em_qualificacao"
  | "qualificado"
  | "aguardando_consultor"
  | "em_negociacao"
  | "convertido"
  | "perdido"
  // Compatibilidade legada
  | "novo"
  | "conversando"
  | "aguardando_documentos"
  | "documentos_recebidos"
  | "em_analise"
  | "fechado";

export const ETAPAS: Etapa[] = [
  "novo_contato",
  "primeiro_atendimento",
  "em_qualificacao",
  "qualificado",
  "aguardando_consultor",
  "em_negociacao",
  "convertido",
  "perdido",
];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  novo_contato: "Novo Contato",
  primeiro_atendimento: "Primeiro Atendimento",
  em_qualificacao: "Em Qualificação",
  qualificado: "Lead Qualificado",
  aguardando_consultor: "Aguardando Consultor",
  em_negociacao: "Em Negociação",
  convertido: "Convertido",
  perdido: "Perdido",
  // Legado
  novo: "Novo Contato",
  conversando: "Primeiro Atendimento",
  aguardando_documentos: "Esperando Documentos",
  documentos_recebidos: "Documentos Recebidos",
  em_analise: "Em Análise",
  fechado: "Convertido",
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

/*
  Fato sobre a operação. Diferente de RespostaBoa: lá é COMO falar,
  aqui é O QUE é verdade. Nunca contém valor, taxa ou parcela.
*/
export type Conhecimento = {
  id: string;
  assunto: string;
  conteudo: string;
  ordem: number;
};

/* Resposta curinga: clicar preenche a caixa da Fila, não envia. */
export type Atalho = {
  id: string;
  titulo: string;
  texto: string;
  ordem: number;
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

/* ------------------------------------------------------------------
   Follow-up com Aprovação Humana Obrigatória (Fase 2)
------------------------------------------------------------------ */

export type StatusFollowup =
  | "pendente"
  | "aprovada"
  | "rejeitada"
  | "cancelada"
  | "enviada"
  | "expirada";

export type SolicitacaoFollowup = {
  id: string;
  user_id: string;
  id_conversa: string;
  id_conexao?: string | null;
  mensagem_sugerida: string;
  mensagem_aprovada?: string | null;
  motivo: string;
  estagio_comercial?: string | null;
  tentativa: number;
  momento_recomendado?: string | null;
  status: StatusFollowup;
  rejeicao_motivo?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  hash_aprovacao?: string | null;
  enviado_em?: string | null;
  erro_envio?: string | null;
  criado_em: string;
  atualizado_em: string;
};

/* ------------------------------------------------------------------
   Provedores de Inteligência Artificial e Telemetria
------------------------------------------------------------------ */

export type ProvedorIa = "gemini" | "openai" | "claude" | "groq" | "ollama";

export type ConfigIA = {
  id: string;
  user_id: string;
  provedor_primario: ProvedorIa;
  modelo_primario: string;
  provedor_secundario?: ProvedorIa | "nenhum" | null;
  modelo_secundario?: string | null;
  fallback_ativo: boolean;
  credenciais: Record<string, string>;
  temperatura: number;
  atualizado_em: string;
};

export type ConsumoIA = {
  id: string;
  user_id: string;
  id_conversa?: string | null;
  provedor: string;
  modelo: string;
  operacao: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total: number;
  custo_estimado: number;
  latencia_ms: number;
  sucesso: boolean;
  erro?: string | null;
  foi_fallback: boolean;
  criado_em: string;
};

