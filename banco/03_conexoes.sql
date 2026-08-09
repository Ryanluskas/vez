-- =============================================================
-- Vez — tabela de conexão (Fase 2)
-- Rode depois do 01 e do 02.
--
-- Uma linha por consultor. E a ponte entre o motor (que roda no PC
-- dele) e o painel (que roda na Vercel): o motor escreve aqui o que
-- esta acontecendo, e o painel le pra mostrar o QR e dizer a verdade
-- sobre o estado do motor.
-- =============================================================

create table if not exists public.conexoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  estado        text not null default 'desligado'
                  check (estado in ('desligado','iniciando','aguardando_qr','conectado')),
  -- QR ja renderizado como data URL pelo motor: o painel so mostra a imagem.
  qr            text,
  telefone      text,
  aparelho      text,
  detalhe       text,
  -- Batida de coração do motor. Sem ela, "conectado" mentiria depois de
  -- alguem simplesmente fechar o programa.
  visto_em      timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column public.conexoes.visto_em is
  'Atualizado a cada 30s pelo motor. O painel so considera o motor ligado se visto_em for recente.';

alter table public.conexoes enable row level security;

drop policy if exists conexoes_leitura   on public.conexoes;
drop policy if exists conexoes_insercao  on public.conexoes;
drop policy if exists conexoes_alteracao on public.conexoes;
drop policy if exists conexoes_remocao   on public.conexoes;

create policy conexoes_leitura on public.conexoes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conexoes_insercao on public.conexoes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conexoes_alteracao on public.conexoes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conexoes_remocao on public.conexoes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime: o painel reage na hora que o QR aparece ou o motor conecta.
do $$
begin
  begin
    alter publication supabase_realtime add table public.conexoes;
  exception when duplicate_object then null;
  end;
end $$;

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'conexoes'
group by c.relname, c.relrowsecurity;
