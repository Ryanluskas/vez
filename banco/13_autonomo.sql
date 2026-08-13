-- =============================================================
-- Vez — modo autônomo
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui todo rascunho esperava aprovacao. O objetivo do produto e outro:
  o bot fecha com o cliente enquanto o consultor faz outra coisa, e so
  pergunta o que so ele sabe.

  O que torna isso seguro nao e a aprovacao — e a regra de ouro. Pergunta
  de valor nunca vira rascunho, entao nunca chega perto de sair sozinha.
  O modo autonomo libera apenas as categorias que o consultor marcar, e
  'valor' nao pode ser marcada.
*/
create table if not exists public.preferencias (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  modo_autonomo boolean not null default false,
  categorias    text[] not null default array['saudacao','documentos','prazo','horario','acompanhamento'],
  atualizado_em timestamptz not null default now()
);

comment on column public.preferencias.categorias is
  'Categorias que podem sair sem aprovacao. "valor" nunca entra aqui — e barrada no painel e no motor.';

alter table public.preferencias enable row level security;

drop policy if exists preferencias_leitura   on public.preferencias;
drop policy if exists preferencias_insercao  on public.preferencias;
drop policy if exists preferencias_alteracao on public.preferencias;

create policy preferencias_leitura on public.preferencias
  for select to authenticated using ((select auth.uid()) = user_id);

create policy preferencias_insercao on public.preferencias
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy preferencias_alteracao on public.preferencias
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/*
  Marca o que saiu sozinho. Serve pra duas coisas: o consultor consegue ver
  no historico o que ele nao leu antes de sair, e o aprendizado ignora essas
  mensagens — aprender com texto que ninguem conferiu compoe erro em cima
  de erro.
*/
alter table public.rascunhos add column if not exists automatico boolean not null default false;

-- Conferencia
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='rascunhos' and column_name='automatico') as coluna_automatico,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='preferencias') as tabela_preferencias;
