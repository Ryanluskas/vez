-- ============================================================================
-- Vez — Migration 23: Esteira Comercial Completa, CRM, Funil e WhatsApp Evolution
-- ============================================================================

-- 1. Ampliação da tabela conversas para Funil Comercial de 8 Etapas, CRM e LGPD
alter table public.conversas
  add column if not exists opt_out boolean not null default false;

alter table public.conversas
  add column if not exists opt_out_em timestamptz;

alter table public.conversas
  add column if not exists motivo_opt_out text;

alter table public.conversas
  add column if not exists consentimento boolean not null default true;

alter table public.conversas
  add column if not exists origem_contato text not null default 'whatsapp_organico'
    check (origem_contato in ('whatsapp_organico', 'lista_ativa', 'indicacao', 'site', 'prospeccao'));

alter table public.conversas
  add column if not exists responsavel_id uuid references auth.users (id) on delete set null;

alter table public.conversas
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.conversas
  add column if not exists observacoes text;

-- Atualização da restrição de etapa para comportar o funil de 8 etapas
alter table public.conversas drop constraint if exists conversas_etapa_check;

update public.conversas
  set etapa = case
    when etapa in ('novo', 'novo_contato') then 'novo_contato'
    when etapa in ('conversando', 'primeiro_atendimento') then 'primeiro_atendimento'
    when etapa in ('em_qualificacao', 'aguardando_documentos') then 'em_qualificacao'
    when etapa in ('qualificado', 'aguardando_simulacao') then 'qualificado'
    when etapa in ('aguardando_consultor', 'aguardando_voce', 'aguardando_ryan') then 'aguardando_consultor'
    when etapa in ('em_negociacao', 'aguardando_digitacao') then 'em_negociacao'
    when etapa in ('convertido', 'concluido', 'fechado') then 'convertido'
    when etapa in ('perdido', 'arquivado') then 'perdido'
    else 'novo_contato'
  end;

alter table public.conversas
  add constraint conversas_etapa_check
  check (etapa in (
    -- 8 etapas comerciais oficiais
    'novo_contato',
    'primeiro_atendimento',
    'em_qualificacao',
    'qualificado',
    'aguardando_consultor',
    'em_negociacao',
    'convertido',
    'perdido',
    -- compatibilidade com estados operacionais pre-existentes
    'novo',
    'conversando',
    'aguardando_documentos',
    'aguardando_simulacao',
    'aguardando_digitacao',
    'concluido',
    'aguardando_voce',
    'aguardando_ryan'
  ));

create index if not exists conversas_por_opt_out
  on public.conversas (user_id, opt_out);

create index if not exists conversas_por_responsavel
  on public.conversas (user_id, responsavel_id);

-- 2. Rastreamento e Idempotência de Mensagens WhatsApp
alter table public.mensagens
  add column if not exists id_mensagem_whatsapp text;

alter table public.mensagens
  add column if not exists status_entrega text not null default 'entregue'
    check (status_entrega in ('pendente', 'enviado', 'entregue', 'lido', 'incerto', 'falha'));

create index if not exists mensagens_por_id_whatsapp
  on public.mensagens (id_mensagem_whatsapp)
  where id_mensagem_whatsapp is not null;

-- 3. Campanhas e Captação Ativa por Listas Autorizadas
create table if not exists public.campanhas_lista (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  nome            text not null,
  arquivo_nome    text,
  total_linhas    integer not null default 0,
  validos         integer not null default 0,
  duplicados      integer not null default 0,
  opt_outs        integer not null default 0,
  status          text not null default 'pronta'
                    check (status in ('pronta', 'em_execucao', 'pausada', 'concluida', 'cancelada')),
  horario_inicio  time not null default '08:00:00',
  horario_fim     time not null default '20:00:00',
  delay_segundos  integer not null default 3 check (delay_segundos between 1 and 60),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.itens_campanha (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  id_campanha     uuid not null references public.campanhas_lista (id) on delete cascade,
  telefone        text not null,
  nome            text,
  convenio        text,
  cpf             text,
  margem          numeric(12, 2),
  status          text not null default 'pendente'
                    check (status in ('pendente', 'disparado', 'respondido', 'falha', 'bloqueado_optout')),
  id_conversa     uuid references public.conversas (id) on delete set null,
  enviado_em      timestamptz,
  erro            text,
  criado_em       timestamptz not null default now()
);

create index if not exists itens_campanha_por_status
  on public.itens_campanha (id_campanha, status);

alter table public.campanhas_lista enable row level security;
alter table public.itens_campanha enable row level security;

drop policy if exists campanhas_lista_leitura   on public.campanhas_lista;
drop policy if exists campanhas_lista_insercao  on public.campanhas_lista;
drop policy if exists campanhas_lista_alteracao on public.campanhas_lista;
drop policy if exists campanhas_lista_remocao   on public.campanhas_lista;

create policy campanhas_lista_leitura on public.campanhas_lista
  for select to authenticated using ((select auth.uid()) = user_id);

create policy campanhas_lista_insercao on public.campanhas_lista
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy campanhas_lista_alteracao on public.campanhas_lista
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy campanhas_lista_remocao on public.campanhas_lista
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists itens_campanha_leitura   on public.itens_campanha;
drop policy if exists itens_campanha_insercao  on public.itens_campanha;
drop policy if exists itens_campanha_alteracao on public.itens_campanha;
drop policy if exists itens_campanha_remocao   on public.itens_campanha;

create policy itens_campanha_leitura on public.itens_campanha
  for select to authenticated using ((select auth.uid()) = user_id);

create policy itens_campanha_insercao on public.itens_campanha
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy itens_campanha_alteracao on public.itens_campanha
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy itens_campanha_remocao on public.itens_campanha
  for delete to authenticated using ((select auth.uid()) = user_id);

do $$
begin
  begin
    alter publication supabase_realtime add table public.campanhas_lista;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.itens_campanha;
  exception when duplicate_object then null;
  end;
end $$;
