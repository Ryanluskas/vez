-- =============================================================
-- Vez — respostas curinga
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O consultor responde a mesma coisa o dia inteiro: "vou verificar",
  "sem margem", "o banco negou". Digitar isso vinte vezes por dia e o tipo
  de atrito que faz largar a ferramenta e voltar pro WhatsApp puro.

  Atalho NAO envia sozinho: clicar preenche a caixa de resposta. O que sai
  continua passando pelo mesmo caminho — vira rascunho e espera aprovacao.
  Um clique que dispara mensagem seria facil de errar com a mao.
*/
create table if not exists public.atalhos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  titulo    text not null,
  texto     text not null,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists atalhos_do_usuario
  on public.atalhos (user_id, ordem, criado_em);

alter table public.atalhos enable row level security;

drop policy if exists atalhos_leitura   on public.atalhos;
drop policy if exists atalhos_insercao  on public.atalhos;
drop policy if exists atalhos_alteracao on public.atalhos;
drop policy if exists atalhos_remocao   on public.atalhos;

create policy atalhos_leitura on public.atalhos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy atalhos_insercao on public.atalhos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy atalhos_alteracao on public.atalhos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy atalhos_remocao on public.atalhos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'atalhos'
group by c.relname, c.relrowsecurity;
