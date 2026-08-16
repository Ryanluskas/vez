-- =============================================================
-- Vez — o que o agente fez, e quando
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Uma linha por ferramenta executada. Serve pra uma pergunta que hoje nao
  tem resposta: "por que o bot fez isso ontem as 14h?".

  Sem este registro, a unica pista e o log no terminal da maquina do
  consultor — que ele fecha, que rola pra cima e some, e que nao existe
  mais quando o problema aparece dois dias depois.

  O QUE NAO ENTRA AQUI: valor, parcela, taxa, saldo. Os argumentos das
  ferramentas ja sao barrados no codigo (ferramentas.js, `semDinheiro`),
  entao esta tabela nunca deveria ver um numero desses. Se um dia vir, o
  bug esta la, nao aqui.

  Ela cresce rapido: uma linha por acao, varias por mensagem. Por isso o
  indice e por (user_id, criado_em desc) — a consulta que importa e
  "o que aconteceu agora", nunca "tudo que ja aconteceu".
*/
create table if not exists public.acoes_do_agente (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  id_conversa uuid references public.conversas (id) on delete cascade,

  ferramenta  text not null,
  argumentos  jsonb not null default '{}'::jsonb,

  ok          boolean not null default true,
  erro        text,
  -- Quanto demorou. E como se descobre qual ferramenta esta segurando o bot.
  ms          int,

  criado_em   timestamptz not null default now()
);

comment on table public.acoes_do_agente is
  'Registro das ferramentas executadas pelo agente. Nunca guarda valor, parcela nem taxa.';

create index if not exists acoes_recentes
  on public.acoes_do_agente (user_id, criado_em desc);

create index if not exists acoes_da_conversa
  on public.acoes_do_agente (id_conversa, criado_em desc);

alter table public.acoes_do_agente enable row level security;

drop policy if exists acoes_leitura   on public.acoes_do_agente;
drop policy if exists acoes_insercao  on public.acoes_do_agente;
drop policy if exists acoes_alteracao on public.acoes_do_agente;
drop policy if exists acoes_remocao   on public.acoes_do_agente;

create policy acoes_leitura on public.acoes_do_agente
  for select to authenticated using ((select auth.uid()) = user_id);

create policy acoes_insercao on public.acoes_do_agente
  for insert to authenticated with check ((select auth.uid()) = user_id);

/*
  Sem policy de update: registro que pode ser reescrito nao serve de
  registro. Remocao existe so pra faxina — a tabela cresce sozinha.
*/
create policy acoes_remocao on public.acoes_do_agente
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='acoes_do_agente') as tabela,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='acoes_do_agente') as politicas;
