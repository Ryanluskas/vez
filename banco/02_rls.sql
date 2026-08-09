-- =============================================================
-- Vez — Row-Level Security
-- Rode DEPOIS do 01_tabelas.sql.
--
-- A regra e sempre a mesma nas cinco tabelas: a linha so existe
-- para quem e dono dela. Isso vale para o painel E para o motor
-- local, porque os dois falam com o banco usando a chave anon
-- e a sessao do proprio consultor.
--
-- 'select auth.uid()' vem entre parenteses de proposito: assim o
-- Postgres avalia uma vez por consulta em vez de uma vez por linha.
-- =============================================================

alter table public.conversas       enable row level security;
alter table public.mensagens       enable row level security;
alter table public.pendencias      enable row level security;
alter table public.rascunhos       enable row level security;
alter table public.respostas_boas  enable row level security;

-- -------------------------------------------------------------
-- conversas
-- -------------------------------------------------------------
drop policy if exists conversas_leitura   on public.conversas;
drop policy if exists conversas_insercao  on public.conversas;
drop policy if exists conversas_alteracao on public.conversas;
drop policy if exists conversas_remocao   on public.conversas;

create policy conversas_leitura on public.conversas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conversas_insercao on public.conversas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conversas_alteracao on public.conversas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conversas_remocao on public.conversas
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- mensagens
-- -------------------------------------------------------------
drop policy if exists mensagens_leitura   on public.mensagens;
drop policy if exists mensagens_insercao  on public.mensagens;
drop policy if exists mensagens_alteracao on public.mensagens;
drop policy if exists mensagens_remocao   on public.mensagens;

create policy mensagens_leitura on public.mensagens
  for select to authenticated using ((select auth.uid()) = user_id);

create policy mensagens_insercao on public.mensagens
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy mensagens_alteracao on public.mensagens
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy mensagens_remocao on public.mensagens
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- pendencias (a fila)
-- -------------------------------------------------------------
drop policy if exists pendencias_leitura   on public.pendencias;
drop policy if exists pendencias_insercao  on public.pendencias;
drop policy if exists pendencias_alteracao on public.pendencias;
drop policy if exists pendencias_remocao   on public.pendencias;

create policy pendencias_leitura on public.pendencias
  for select to authenticated using ((select auth.uid()) = user_id);

create policy pendencias_insercao on public.pendencias
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy pendencias_alteracao on public.pendencias
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pendencias_remocao on public.pendencias
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- rascunhos
-- -------------------------------------------------------------
drop policy if exists rascunhos_leitura   on public.rascunhos;
drop policy if exists rascunhos_insercao  on public.rascunhos;
drop policy if exists rascunhos_alteracao on public.rascunhos;
drop policy if exists rascunhos_remocao   on public.rascunhos;

create policy rascunhos_leitura on public.rascunhos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy rascunhos_insercao on public.rascunhos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy rascunhos_alteracao on public.rascunhos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy rascunhos_remocao on public.rascunhos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- respostas_boas (o "Meu jeito")
-- -------------------------------------------------------------
drop policy if exists exemplos_leitura   on public.respostas_boas;
drop policy if exists exemplos_insercao  on public.respostas_boas;
drop policy if exists exemplos_alteracao on public.respostas_boas;
drop policy if exists exemplos_remocao   on public.respostas_boas;

create policy exemplos_leitura on public.respostas_boas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy exemplos_insercao on public.respostas_boas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy exemplos_alteracao on public.respostas_boas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy exemplos_remocao on public.respostas_boas
  for delete to authenticated using ((select auth.uid()) = user_id);

-- =============================================================
-- Conferencia. As cinco tabelas tem que aparecer com rls_ligado = true
-- e 4 politicas cada uma.
-- =============================================================
select
  c.relname                    as tabela,
  c.relrowsecurity             as rls_ligado,
  count(p.polname)             as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('conversas','mensagens','pendencias','rascunhos','respostas_boas')
group by c.relname, c.relrowsecurity
order by c.relname;
