-- =============================================================
-- Vez — separar cliente de não-cliente (Fase 6)
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O motor nao tem como adivinhar quem e cliente: pro WhatsApp, a mae do
  consultor e um contato igual a qualquer outro. Entao o padrao e atender
  todo mundo — porque lead novo e justamente o que o produto existe pra
  pegar — e o consultor silencia na mao quem nao e cliente.

  Silenciar NAO apaga historico: as mensagens continuam sendo gravadas.
  So o cerebro para de rodar naquela conversa.
*/
alter table public.conversas
  add column if not exists atender boolean not null default true;

comment on column public.conversas.atender is
  'false = o bot nao classifica, nao cria pendencia e nao escreve rascunho nesta conversa. As mensagens continuam sendo gravadas.';

-- A consulta que o motor faz a cada mensagem recebida.
create index if not exists conversas_atendidas
  on public.conversas (user_id, telefone)
  where atender;

-- Conferencia
select column_name as coluna, column_default as padrao
from information_schema.columns
where table_schema = 'public' and table_name = 'conversas' and column_name = 'atender';
