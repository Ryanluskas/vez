-- =============================================================
-- Vez — observabilidade: o diario do agente e a saude do motor
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O 17 criou a tabela so pras ferramentas. Aqui ela vira o diario inteiro:
  mensagem recebida, classificacao, decisao, ferramenta, resposta escrita,
  validacao, envio, handoff, erro, retry, follow-up.

  Uma tabela so, e nao uma por tipo, porque a pergunta que o consultor faz
  e sempre a mesma: "o que aconteceu nesta conversa, na ordem?". Duas
  tabelas exigiriam um union toda vez que ele abrisse a tela.
*/
alter table public.acoes_do_agente
  add column if not exists tipo text not null default 'ferramenta';

-- Uma frase curta pro consultor ler. Nunca raciocinio do modelo.
alter table public.acoes_do_agente
  add column if not exists detalhe text;

/*
  Agora existe evento que nao e ferramenta, entao a coluna deixa de ser
  obrigatoria. `drop not null` e idempotente na pratica: rodar de novo numa
  coluna que ja e nullable nao faz nada.
*/
alter table public.acoes_do_agente alter column ferramenta drop not null;

comment on column public.acoes_do_agente.tipo is
  'mensagem_recebida | classificacao | decisao | ferramenta | resposta_gerada | validacao | mensagem_enviada | handoff | resposta_do_consultor | memoria | funil | followup | erro | retry';

create index if not exists acoes_por_tipo
  on public.acoes_do_agente (user_id, tipo, criado_em desc);

/* -------------------------------------------------------------
   Estado do motor

   O painel roda na Vercel; o motor roda na maquina do consultor. Um nao
   enxerga o outro. A unica forma honesta de o painel saber se o motor
   esta vivo e o motor dizer, de tempos em tempos, que esta.

   Sem isso o painel mente por omissao: mostra a fila parada e o consultor
   acha que ninguem escreveu, quando na verdade o motor caiu as 9h.
------------------------------------------------------------- */
create table if not exists public.motor_estado (
  user_id         uuid primary key references auth.users (id) on delete cascade,

  -- ligado | reconectando | erro. 'offline' nao e gravado: e a AUSENCIA de
  -- batimento recente, e quem conclui isso e o painel, olhando o relogio.
  estado          text not null default 'ligado'
                    check (estado in ('ligado','reconectando','erro')),

  detalhe         text,
  -- Saude das dependencias externas: {"ollama":"ok","groq":"ok",...}
  servicos        jsonb not null default '{}'::jsonb,
  versao          text,

  batimento_em    timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

comment on table public.motor_estado is
  'Um batimento por motor. Sem batimento recente = offline, e quem conclui isso e o painel.';

alter table public.motor_estado enable row level security;

drop policy if exists motor_leitura   on public.motor_estado;
drop policy if exists motor_insercao  on public.motor_estado;
drop policy if exists motor_alteracao on public.motor_estado;

create policy motor_leitura on public.motor_estado
  for select to authenticated using ((select auth.uid()) = user_id);

create policy motor_insercao on public.motor_estado
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy motor_alteracao on public.motor_estado
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* -------------------------------------------------------------
   Metricas

   View, nao tabela: numero calculado na hora nunca fica velho, e nao
   existe processo pra manter. Com o volume de um consultor — algumas
   centenas de eventos por dia — isso e instantaneo.

   A metrica que importa e a taxa de automacao: de tudo que chegou, quanto
   o bot resolveu sozinho. E ela que diz se o produto esta cumprindo a
   promessa ou se o consultor continua atendendo tudo na mao.
------------------------------------------------------------- */
create or replace view public.metricas_do_agente
with (security_invoker = true) as
select
  user_id,
  date_trunc('day', criado_em)                                          as dia,

  count(*) filter (where tipo = 'mensagem_recebida')                    as recebidas,
  count(*) filter (where tipo = 'mensagem_enviada')                     as enviadas,
  count(*) filter (where tipo = 'mensagem_enviada' and ok)              as automaticas,
  count(*) filter (where tipo = 'handoff')                              as handoffs,
  count(*) filter (where tipo = 'ferramenta')                           as ferramentas,
  count(*) filter (where tipo = 'validacao' and not ok)                 as validacoes_reprovadas,
  count(*) filter (where tipo = 'erro')                                 as erros,
  count(*) filter (where tipo = 'retry')                                as retentativas,
  count(*) filter (where tipo = 'followup')                             as followups,

  /*
    Taxa de automacao. O denominador e o que o bot VIU, e o numerador o que
    ele resolveu sem chamar ninguem. Divisao protegida: dia sem mensagem
    nenhuma nao pode virar erro de consulta.
  */
  round(
    100.0 * count(*) filter (where tipo = 'mensagem_enviada')
    / nullif(count(*) filter (where tipo = 'mensagem_recebida'), 0)
  , 1)                                                                   as taxa_automacao,

  -- Tempo de resposta: quanto o agente levou pra decidir e escrever.
  round(avg(ms) filter (where tipo = 'resposta_gerada'))                 as ms_medio_resposta,
  max(ms) filter (where tipo = 'resposta_gerada')                        as ms_pior_resposta

from public.acoes_do_agente
group by user_id, date_trunc('day', criado_em);

comment on view public.metricas_do_agente is
  'Um dia por linha. security_invoker = o RLS da tabela vale aqui tambem.';

/*
  Por que o bot chamou voce. Responde "o handoff esta acontecendo pelo
  motivo certo?" — se 90% for 'valor', o produto esta funcionando como
  desenhado; se for 'erro', tem coisa quebrada.
*/
create or replace view public.motivos_de_handoff
with (security_invoker = true) as
select
  user_id,
  coalesce(detalhe, 'sem motivo')  as motivo,
  count(*)                          as vezes,
  max(criado_em)                    as ultima_vez
from public.acoes_do_agente
where tipo = 'handoff'
group by user_id, coalesce(detalhe, 'sem motivo');

-- Conferencia
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='acoes_do_agente' and column_name='tipo') as coluna_tipo,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='motor_estado') as tabela_motor,
  (select count(*) from information_schema.views
    where table_schema='public' and table_name='metricas_do_agente') as view_metricas;
