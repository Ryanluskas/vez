-- ============================================================================
-- Vez — Migration 25: Dossiê Inteligente de Pagamento, Conferência e Aprovação
-- Idempotente: pode ser executado múltiplas vezes com segurança.
-- ============================================================================

create table if not exists public.operacoes_pagamento (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  id_conversa         uuid not null references public.conversas (id) on delete cascade,
  codigo_operacao     text not null unique,
  status              text not null default 'em_coleta'
                        check (status in ('em_coleta', 'conferido_pendente_aprovacao', 'aprovado', 'encaminhado', 'rejeitado')),
  checklist           jsonb not null default '{
    "contratos": false,
    "extrato_margem": false,
    "contracheque": false,
    "comprovante_endereco": false,
    "documento_foto": false
  }'::jsonb,
  dados_extraidos     jsonb not null default '{}'::jsonb,
  conferencia         jsonb not null default '{}'::jsonb,
  calculos            jsonb not null default '{}'::jsonb,
  texto_pagamento     text,
  aprovado_por        uuid references auth.users (id),
  aprovado_em         timestamptz,
  hash_aprovacao      text,
  grupo_destino_jid   text,
  encaminhado_em      timestamptz,
  erro_envio          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

comment on table public.operacoes_pagamento is
  'Dossiês de pagamento para conferência de contratos, validações documentais e aprovação humana.';

create index if not exists operacoes_por_usuario_status
  on public.operacoes_pagamento (user_id, status, criado_em desc);

create index if not exists operacoes_por_conversa
  on public.operacoes_pagamento (id_conversa);

alter table public.operacoes_pagamento enable row level security;

drop policy if exists operacoes_pagamento_leitura   on public.operacoes_pagamento;
drop policy if exists operacoes_pagamento_insercao  on public.operacoes_pagamento;
drop policy if exists operacoes_pagamento_alteracao on public.operacoes_pagamento;
drop policy if exists operacoes_pagamento_remocao   on public.operacoes_pagamento;

create policy operacoes_pagamento_leitura on public.operacoes_pagamento
  for select to authenticated using ((select auth.uid()) = user_id);

create policy operacoes_pagamento_insercao on public.operacoes_pagamento
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy operacoes_pagamento_alteracao on public.operacoes_pagamento
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy operacoes_pagamento_remocao on public.operacoes_pagamento
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Documentos vinculados ao dossiê
create table if not exists public.documentos_operacao (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  id_operacao           uuid not null references public.operacoes_pagamento (id) on delete cascade,
  tipo_documento        text not null default 'nao_identificado'
                          check (tipo_documento in ('contratos', 'extrato_margem', 'contracheque', 'comprovante_endereco', 'documento_foto', 'nao_identificado')),
  arquivo_nome          text,
  mimetype              text,
  tamanho_bytes         integer,
  arquivo_base64_ou_url text,
  paginas               integer default 1,
  legivel               boolean not null default true,
  dados_extraidos       jsonb default '{}'::jsonb,
  criado_em             timestamptz not null default now()
);

alter table public.documentos_operacao enable row level security;

drop policy if exists documentos_operacao_leitura   on public.documentos_operacao;
drop policy if exists documentos_operacao_insercao  on public.documentos_operacao;
drop policy if exists documentos_operacao_alteracao on public.documentos_operacao;
drop policy if exists documentos_operacao_remocao   on public.documentos_operacao;

create policy documentos_operacao_leitura on public.documentos_operacao
  for select to authenticated using ((select auth.uid()) = user_id);

create policy documentos_operacao_insercao on public.documentos_operacao
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy documentos_operacao_alteracao on public.documentos_operacao
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy documentos_operacao_remocao on public.documentos_operacao
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Contratos identificados individualmente
create table if not exists public.contratos_operacao (
  id                  uuid primary key default gen_random_uuid(),
  id_operacao         uuid not null references public.operacoes_pagamento (id) on delete cascade,
  id_documento        uuid references public.documentos_operacao (id) on delete set null,
  banco               text not null default 'Santander',
  numero_contrato     text not null,
  valor_parcela       numeric(12,2) not null default 0,
  saldo_devedor       numeric(12,2),
  parcelas_total      integer default 120,
  parcelas_restantes  integer,
  criado_em           timestamptz not null default now()
);

alter table public.contratos_operacao enable row level security;

drop policy if exists contratos_operacao_leitura on public.contratos_operacao;
drop policy if exists contratos_operacao_geral   on public.contratos_operacao;

create policy contratos_operacao_geral on public.contratos_operacao
  for all to authenticated
  using (
    exists (
      select 1 from public.operacoes_pagamento op
      where op.id = contratos_operacao.id_operacao
        and op.user_id = (select auth.uid())
    )
  );

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.operacoes_pagamento;
  exception when duplicate_object then null;
  end;
end $$;
