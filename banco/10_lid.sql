-- =============================================================
-- Vez — WhatsApp migrou os identificadores para LID
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O WhatsApp trocou o identificador das conversas: em vez de
  "5562995598124@c.us" (o telefone), agora usa "13916230930575@lid" — um id
  que nao revela o numero. Medido nesta conta: 102 de 105 conversas ja sao
  @lid, so 1 continua @c.us.

  O telefone real continua acessivel (contact.phoneNumber), entao ele segue
  sendo o que o consultor ve. Mas pra FALAR com a conversa e preciso o id
  original — reconstruir "telefone@c.us" nao funciona pra contato que so
  existe como @lid.
*/
alter table public.conversas add column if not exists id_chat text;

comment on column public.conversas.id_chat is
  'Identificador da conversa no WhatsApp (13916...@lid ou 5562...@c.us). E por ele que o motor envia; o telefone e so pra voce ler.';

create index if not exists conversas_por_id_chat
  on public.conversas (id_conexao, id_chat);

-- Conferencia
select column_name as coluna
from information_schema.columns
where table_schema = 'public' and table_name = 'conversas' and column_name = 'id_chat';
