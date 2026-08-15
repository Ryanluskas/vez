-- =============================================================
-- Vez — memória por cliente
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui o bot lia as ultimas 4 mensagens e mais nada. Ele nao lembrava o
  nome que o cliente deu ontem, nem que ja tinha pedido o contracheque.
  Entao repergunta — e cliente que responde a mesma pergunta duas vezes
  conclui, com razao, que do outro lado nao tem ninguem prestando atencao.

  Uma linha por conversa. Nao por telefone: o mesmo cliente falando com o
  numero comercial e com o antigo sao dois atendimentos diferentes, com
  estados diferentes.

  REGRA: aqui NAO entra valor, parcela, saldo, margem nem taxa. Isso muda a
  cada simulacao e so o consultor sabe. A memoria guarda o que o CLIENTE
  contou sobre ele mesmo, nao o que o banco respondeu sobre a proposta.
*/
create table if not exists public.memoria (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  id_conversa   uuid not null unique references public.conversas (id) on delete cascade,

  -- Dados do cliente, do jeito que ele contou.
  nome          text,
  convenio      text check (convenio in ('inss','servidor','militar','outro')),
  banco         text,
  objetivo      text check (objetivo in
                  ('reducao_taxa','refinanciamento','emprestimo_novo','portabilidade','duvida','outro')),

  /*
    O que ja foi coletado. Chave = nome do requisito (ver requisitos.js),
    valor = { confirmado: bool, em: timestamp, como: 'cliente'|'consultor'|'sistema' }.
    JSONB porque a lista de requisitos muda com o produto, e migrar coluna
    a cada mudanca seria atrito sem beneficio.
  */
  coletado      jsonb not null default '{}'::jsonb,

  -- O que o bot ja perguntou, pra nao perguntar de novo em looping.
  perguntado    jsonb not null default '{}'::jsonb,

  -- Ultima acao do agente, em uma linha, pra debug no painel.
  ultima_acao   text,
  ultimo_motivo text,

  atualizado_em timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);

comment on table public.memoria is
  'O que o bot sabe sobre ESTE cliente. Nunca guarda valor, parcela ou taxa — isso vem do consultor a cada simulacao.';

create index if not exists memoria_da_conversa on public.memoria (id_conversa);

alter table public.memoria enable row level security;

drop policy if exists memoria_leitura   on public.memoria;
drop policy if exists memoria_insercao  on public.memoria;
drop policy if exists memoria_alteracao on public.memoria;
drop policy if exists memoria_remocao   on public.memoria;

create policy memoria_leitura on public.memoria
  for select to authenticated using ((select auth.uid()) = user_id);

create policy memoria_insercao on public.memoria
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy memoria_alteracao on public.memoria
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy memoria_remocao on public.memoria
  for delete to authenticated using ((select auth.uid()) = user_id);

/*
  Idempotencia no caminho ao vivo. A coluna id_whatsapp e o indice unico ja
  existiam desde o 08, mas SO A IMPORTACAO usava — a entrada ao vivo gravava
  sem id. O WhatsApp reentrega evento, e sem isto o bot responde duas vezes
  a mesma mensagem.
*/
create index if not exists mensagens_recentes_da_conversa
  on public.mensagens (id_conversa, criado_em desc);

-- Conferencia
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='memoria') as tabela_memoria,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='memoria') as politicas;
