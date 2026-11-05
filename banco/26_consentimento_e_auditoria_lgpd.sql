-- ============================================================================
-- 26_CONSENTIMENTO_E_AUDITORIA_LGPD.SQL
-- Criação da tabela de auditoria formal de consentimento e opt-out (LGPD).
-- Registra todas as solicitações de descadastramento, reativações voluntárias
-- e bloqueios comerciais, vinculadas à organização (user_id) para isolamento multi-tenant.
-- ============================================================================

create table if not exists public.consentimento_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  id_conversa uuid references public.conversas(id) on delete set null,
  telefone text not null,
  tipo_evento text not null check (
    tipo_evento in (
      'opt_out_solicitado',
      'opt_in_reativacao',
      'exclusao_dados',
      'bloqueio_comercial'
    )
  ),
  canal text not null default 'whatsapp',
  mensagem_gatilho text,
  ip_origem text,
  detalhes jsonb default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- Índices para buscas performáticas por organização e telefone
create index if not exists idx_consentimento_user_tel
  on public.consentimento_historico (user_id, telefone);

create index if not exists idx_consentimento_conversa
  on public.consentimento_historico (id_conversa);

create index if not exists idx_consentimento_criado
  on public.consentimento_historico (criado_em desc);

-- ============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS) — ISOLAMENTO MULTI-TENANT ESTRITO
-- ============================================================================

alter table public.consentimento_historico enable row level security;

-- Política de Leitura: usuários só visualizam eventos de consentimento da sua organização
drop policy if exists "consentimento_select_tenant" on public.consentimento_historico;
create policy "consentimento_select_tenant"
  on public.consentimento_historico
  for select
  using (
    auth.uid() is not null and auth.uid() = user_id
  );

-- Política de Inserção: usuários só inserem na sua organização
drop policy if exists "consentimento_insert_tenant" on public.consentimento_historico;
create policy "consentimento_insert_tenant"
  on public.consentimento_historico
  for insert
  with check (
    auth.uid() is not null and auth.uid() = user_id
  );
