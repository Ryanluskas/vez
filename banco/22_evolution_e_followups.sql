-- ============================================================================
-- Vez — Migration 22: Evolution API, Follow-ups Supervisionados e Multiprovedor IA
-- Pode rodar de novo sem medo: tudo é 'if not exists' / 'drop policy if exists'.
-- ============================================================================

/*
  ============================================================================
  1. FOLLOW-UPS SUPERVISIONADOS (APROVAÇÃO HUMANA OBRIGATÓRIA)

  A IA identifica que um cliente esfriou, avalia a conversa e redige uma
  sugestão personalizada de acompanhamento. Porém, NENHUMA mensagem externa
  de follow-up pode sair sem a aprovação explícita de um consultor no painel.

  Esta tabela armazena o ciclo de vida completo da solicitação:
    - pendente: gerada pela IA, aguardando revisão humana no painel
    - aprovada: consultor aprovou (ou editou e aprovou), pronta para disparo
    - rejeitada: consultor recusou o envio
    - cancelada: cancelada pelo sistema (ex: cliente respondeu antes do envio)
    - enviada: disparada com sucesso pelo WhatsApp via Evolution API
    - expirada: prazo ideal de envio expirou sem resposta
  ============================================================================
*/

create table if not exists public.solicitacoes_followup (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  id_conversa         uuid not null references public.conversas (id) on delete cascade,
  id_conexao          uuid references public.conexoes (id) on delete set null,
  mensagem_sugerida   text not null,
  mensagem_aprovada   text,
  motivo              text not null,
  estagio_comercial   text,
  tentativa           integer not null default 1 check (tentativa between 1 and 3),
  momento_recomendado timestamptz,
  status              text not null default 'pendente'
                        check (status in ('pendente', 'aprovada', 'rejeitada', 'cancelada', 'enviada', 'expirada')),
  rejeicao_motivo     text,
  aprovado_por        uuid references auth.users (id),
  aprovado_em         timestamptz,
  hash_aprovacao      text,
  enviado_em          timestamptz,
  erro_envio          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

comment on table public.solicitacoes_followup is
  'Fila de aprovação de follow-ups gerados pela IA. O envio externo depende obrigatoriamente de autorização humana.';

alter table public.solicitacoes_followup add column if not exists hash_aprovacao text;

-- Índices otimizados para busca rápida de pendentes no painel e na varredura do motor:
create index if not exists followup_pendentes_por_chegada
  on public.solicitacoes_followup (user_id, criado_em desc)
  where status = 'pendente';

create index if not exists followup_aprovados_a_enviar
  on public.solicitacoes_followup (user_id, aprovado_em asc)
  where status = 'aprovada' and enviado_em is null;

create index if not exists followup_por_conversa
  on public.solicitacoes_followup (id_conversa, status);

-- RLS: Isolamento estrito por consultor
alter table public.solicitacoes_followup enable row level security;

drop policy if exists followup_leitura   on public.solicitacoes_followup;
drop policy if exists followup_insercao  on public.solicitacoes_followup;
drop policy if exists followup_alteracao on public.solicitacoes_followup;
drop policy if exists followup_remocao   on public.solicitacoes_followup;

create policy followup_leitura on public.solicitacoes_followup
  for select to authenticated using ((select auth.uid()) = user_id);

create policy followup_insercao on public.solicitacoes_followup
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy followup_alteracao on public.solicitacoes_followup
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy followup_remocao on public.solicitacoes_followup
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime: O painel escuta inserções e mudanças de status em tempo real
do $$
begin
  begin
    alter publication supabase_realtime add table public.solicitacoes_followup;
  exception when duplicate_object then null;
  end;
end $$;


/*
  ============================================================================
  2. CONFIGURAÇÃO MULTIPROVEDOR DE INTELIGÊNCIA ARTIFICIAL

  Permite que o consultor selecione no painel seu provedor primário e
  secundário (fallback), personalize modelos (Gemini, Claude, OpenAI, Ollama,
  Groq) e armazene com segurança as credenciais de API por usuário.
  ============================================================================
*/

create table if not exists public.config_ia (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade unique,
  provedor_primario   text not null default 'gemini'
                        check (provedor_primario in ('gemini', 'openai', 'claude', 'groq', 'ollama')),
  modelo_primario     text not null default 'gemini-2.5-flash',
  provedor_secundario text default 'groq'
                        check (provedor_secundario in ('gemini', 'openai', 'claude', 'groq', 'ollama', 'nenhum')),
  modelo_secundario   text default 'llama-3.3-70b-versatile',
  fallback_ativo      boolean not null default true,
  credenciais         jsonb not null default '{}'::jsonb,
  temperatura         numeric not null default 0.4 check (temperatura between 0.0 and 1.0),
  atualizado_em       timestamptz not null default now(),
  criado_em           timestamptz not null default now()
);

comment on table public.config_ia is
  'Configuração de provedores de IA, modelos e preferências de fallback por conta de consultor.';

-- RLS: Isolamento estrito
alter table public.config_ia enable row level security;

drop policy if exists config_ia_leitura   on public.config_ia;
drop policy if exists config_ia_insercao  on public.config_ia;
drop policy if exists config_ia_alteracao on public.config_ia;
drop policy if exists config_ia_remocao   on public.config_ia;

create policy config_ia_leitura on public.config_ia
  for select to authenticated using ((select auth.uid()) = user_id);

create policy config_ia_insercao on public.config_ia
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy config_ia_alteracao on public.config_ia
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy config_ia_remocao on public.config_ia
  for delete to authenticated using ((select auth.uid()) = user_id);


/*
  ============================================================================
  3. TELEMETRIA E CONSUMO DE IA (TOKENS, CUSTOS E LATÊNCIA)

  Rastreabilidade de cada chamada: qual provedor/modelo foi acionado, quantos
  tokens foram consumidos, latência e custo estimado.
  ============================================================================
*/

create table if not exists public.consumo_ia (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  id_conversa     uuid references public.conversas (id) on delete set null,
  provedor        text not null,
  modelo          text not null,
  operacao        text not null,
  tokens_entrada  integer default 0,
  tokens_saida    integer default 0,
  tokens_total    integer default 0,
  custo_estimado  numeric(10, 6) default 0,
  latencia_ms     integer not null default 0,
  sucesso         boolean not null default true,
  erro            text,
  foi_fallback    boolean not null default false,
  criado_em       timestamptz not null default now()
);

comment on table public.consumo_ia is
  'Registro detalhado de chamadas de IA para métricas operacionais, custos e auditoria.';

create index if not exists consumo_ia_por_usuario_data
  on public.consumo_ia (user_id, criado_em desc);

create index if not exists consumo_ia_por_provedor
  on public.consumo_ia (user_id, provedor, criado_em desc);

-- RLS: Isolamento estrito
alter table public.consumo_ia enable row level security;

drop policy if exists consumo_ia_leitura   on public.consumo_ia;
drop policy if exists consumo_ia_insercao  on public.consumo_ia;
drop policy if exists consumo_ia_alteracao on public.consumo_ia;
drop policy if exists consumo_ia_remocao   on public.consumo_ia;

create policy consumo_ia_leitura on public.consumo_ia
  for select to authenticated using ((select auth.uid()) = user_id);

create policy consumo_ia_insercao on public.consumo_ia
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy consumo_ia_alteracao on public.consumo_ia
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy consumo_ia_remocao on public.consumo_ia
  for delete to authenticated using ((select auth.uid()) = user_id);


/*
  ============================================================================
  4. EVOLUTION API — SUPORTE A INSTÂNCIAS DESACOPLADAS EM CONEXÕES

  Campos adicionais para conexão com o gateway Evolution API v2:
  nome da instância, chave de API e URL do gateway.
  ============================================================================
*/

alter table public.conexoes
  add column if not exists tipo_provedor text not null default 'evolution'
    check (tipo_provedor in ('evolution', 'wwebjs'));

alter table public.conexoes
  add column if not exists evolution_instancia text;

alter table public.conexoes
  add column if not exists evolution_apikey text;

alter table public.conexoes
  add column if not exists evolution_server_url text;

alter table public.conexoes
  add column if not exists webhook_secret text;

comment on column public.conexoes.tipo_provedor is
  'evolution = Evolution API v2 desacoplada via Docker; wwebjs = Chromium legado local.';


/*
  ============================================================================
  5. EVOLUÇÃO DO FUNIL DE LEADS E PREFERÊNCIAS DE CONTATO

  - motivo_perda: rastreabilidade quando um lead não fecha negócio
  - qualificacao: temperatura do lead (fria, morna, quente, desqualificada)
  - consentimento_followup: controle de opt-out (LGPD)
  ============================================================================
*/

alter table public.conversas
  add column if not exists motivo_perda text;

alter table public.conversas
  add column if not exists qualificacao text not null default 'indefinida'
    check (qualificacao in ('indefinida', 'fria', 'morna', 'quente', 'desqualificada'));

alter table public.memoria
  add column if not exists consentimento_followup boolean not null default true;

alter table public.memoria
  add column if not exists preferencia_horario text default 'qualquer'
    check (preferencia_horario in ('manha', 'tarde', 'qualquer'));

comment on column public.conversas.motivo_perda is
  'Motivo pelo qual o lead foi marcado como perdido (ex: sem margem, sem interesse, taxa alta).';

comment on column public.memoria.consentimento_followup is
  'Se o cliente autorizou ou solicitou a interrupção de contatos ativos.';
