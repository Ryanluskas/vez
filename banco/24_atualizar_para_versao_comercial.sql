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

-- Sanitiza todos os valores legados ou nulos antes de aplicar a restricao
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
