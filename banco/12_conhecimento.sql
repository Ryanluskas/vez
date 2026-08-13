-- =============================================================
-- Vez — o que o bot sabe sobre a sua operação
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui o bot tinha o TOM do consultor (respostas_boas) mas nao sabia
  NADA do negocio: que empresa e, com que bancos trabalha, como funciona a
  portabilidade com reducao de taxa, que documentos pedir. Entao respondia
  como atendente generico de banco.

  Isto e diferente de respostas_boas: la sao exemplos de COMO falar; aqui
  sao fatos sobre O QUE e verdade.

  REGRA: nada de valor, taxa ou parcela aqui. Esses numeros mudam por
  cliente, e se estivessem neste texto o bot passaria a cita-los sozinho —
  furando a regra de ouro por uma porta lateral. O painel recusa na hora
  de salvar.
*/
create table if not exists public.conhecimento (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  assunto   text not null,
  conteudo  text not null,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists conhecimento_do_usuario
  on public.conhecimento (user_id, ordem, criado_em);

alter table public.conhecimento enable row level security;

drop policy if exists conhecimento_leitura   on public.conhecimento;
drop policy if exists conhecimento_insercao  on public.conhecimento;
drop policy if exists conhecimento_alteracao on public.conhecimento;
drop policy if exists conhecimento_remocao   on public.conhecimento;

create policy conhecimento_leitura on public.conhecimento
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conhecimento_insercao on public.conhecimento
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conhecimento_alteracao on public.conhecimento
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conhecimento_remocao on public.conhecimento
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'conhecimento'
group by c.relname, c.relrowsecurity;
