-- ============================================================================
-- 27_ESTADO_CONVERSACIONAL_E_SEGURANCA_DOSSIE.SQL
-- Evolução do estado conversacional explícito em public.memoria e
-- endurecimento criptográfico/idempotência em public.operacoes_pagamento.
-- Idempotente e reversível (inclui bloco de rollback comentado ao final).
-- ============================================================================

-- 1. Estado conversacional explícito na tabela public.memoria
alter table public.memoria
  add column if not exists recusas jsonb not null default '[]'::jsonb,
  add column if not exists objecoes_identificadas jsonb not null default '[]'::jsonb,
  add column if not exists ultima_pergunta_agente text,
  add column if not exists ultima_pergunta_cliente text,
  add column if not exists contexto_campanha jsonb default '{}'::jsonb;

-- 2. Endurecimento de aprovação, replay protection e rastreio de envio parcial em public.operacoes_pagamento
alter table public.operacoes_pagamento
  add column if not exists aprovacao_consumida_em timestamptz,
  add column if not exists nonce_aprovacao text,
  add column if not exists texto_pagamento_enviado boolean not null default false,
  add column if not exists documentos_enviados jsonb not null default '[]'::jsonb,
  add column if not exists erro_envio text,
  add column if not exists requer_reaprovacao boolean not null default false,
  add column if not exists motivo_reaprovacao text;

-- 3. Atualização da constraint de status de operacoes_pagamento para incluir erro_envio_parcial e conferido_pendente_aprovacao
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'operacoes_pagamento_status_check'
  ) then
    alter table public.operacoes_pagamento
      drop constraint operacoes_pagamento_status_check;
  end if;
exception
  when others then null;
end $$;

alter table public.operacoes_pagamento
  add constraint operacoes_pagamento_status_check
  check (
    status in (
      'em_coleta',
      'em_conferencia',
      'conferido_pendente_aprovacao',
      'pendente_aprovacao',
      'aprovado',
      'encaminhado',
      'erro_envio_parcial',
      'rejeitado',
      'cancelado'
    )
  );

-- 4. Migração controlada de operações legadas aprovadas sem hashes completos ou com assinatura legada
update public.operacoes_pagamento
set
  status = 'pendente_aprovacao',
  hash_aprovacao = null,
  aprovado_em = null,
  requer_reaprovacao = true,
  motivo_reaprovacao = 'Reaprovação exigida pela política de integridade HMAC-SHA256 exclusiva (Migration 27)'
where
  status = 'aprovado'
  and (
    documentos_hash is null
    or dados_bancarios_hash is null
    or hash_aprovacao is null
    or length(hash_aprovacao) <> 64
  );

-- 5. Índices para auditoria e prevenção de replay
create index if not exists idx_operacoes_pagamento_status_tenant
  on public.operacoes_pagamento (user_id, status);

create unique index if not exists idx_operacoes_pagamento_nonce_unico
  on public.operacoes_pagamento (nonce_aprovacao)
  where nonce_aprovacao is not null;

-- ============================================================================
-- ROLLBACK REVERSÍVEL (executar apenas se necessário reverter a migration 27)
-- ============================================================================
-- drop index if exists public.idx_operacoes_pagamento_nonce_unico;
-- drop index if exists public.idx_operacoes_pagamento_status_tenant;
-- alter table public.operacoes_pagamento
--   drop column if exists motivo_reaprovacao,
--   drop column if exists requer_reaprovacao,
--   drop column if exists erro_envio,
--   drop column if exists documentos_enviados,
--   drop column if exists texto_pagamento_enviado,
--   drop column if exists nonce_aprovacao,
--   drop column if exists aprovacao_consumida_em;
-- alter table public.memoria
--   drop column if exists contexto_campanha,
--   drop column if exists ultima_pergunta_cliente,
--   drop column if exists ultima_pergunta_agente,
--   drop column if exists objecoes_identificadas,
--   drop column if exists recusas;
