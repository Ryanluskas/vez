-- =============================================================
-- Vez — funil de venda e follow-up
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  ATENCAO — `estagio` e `etapa` sao coisas diferentes e as duas ficam:

    estagio = onde a MENSAGEM esta no processamento
              (bot atendendo / travada com voce / rascunho pronto)

    etapa   = onde o CLIENTE esta na venda
              (novo / conversando / aguardando documentos / ... / fechado)

  Uma conversa pode estar em "aguardando_documentos" (etapa) e ao mesmo
  tempo "aguardando_voce" (estagio), porque o cliente perguntou o valor
  enquanto separava os papeis. Misturar as duas quebraria as duas.
*/
alter table public.conversas
  add column if not exists etapa text not null default 'novo'
    check (etapa in ('novo','conversando','aguardando_documentos',
                     'documentos_recebidos','em_analise','fechado','perdido'));

comment on column public.conversas.etapa is
  'Funil de venda, independente do estagio de processamento da mensagem.';

-- Follow-up: quantas vezes ja cobramos, e quando foi a ultima.
alter table public.conversas add column if not exists followups_enviados int not null default 0;
alter table public.conversas add column if not exists ultimo_followup_em timestamptz;

-- Quando o cliente escreveu pela ultima vez. E isso que define "sumiu".
alter table public.conversas add column if not exists ultima_recebida_em timestamptz;

-- Interruptor por conversa. Cliente que pediu pra nao insistir merece
-- ser respeitado, e um bot que nao respeita isso vira bloqueio.
alter table public.conversas add column if not exists seguir boolean not null default true;

comment on column public.conversas.seguir is
  'false = nunca mandar follow-up nesta conversa, mesmo que ela esfrie.';

-- A varredura do follow-up: conversas vivas, atendidas, seguindo,
-- que ainda nao levaram 3 cobrancas.
create index if not exists conversas_para_seguir
  on public.conversas (user_id, ultima_recebida_em)
  where atender and seguir and followups_enviados < 3
    and etapa in ('conversando','aguardando_documentos');

-- Conferencia
select column_name as coluna
from information_schema.columns
where table_schema = 'public' and table_name = 'conversas'
  and column_name in ('etapa','followups_enviados','ultimo_followup_em',
                      'ultima_recebida_em','seguir')
order by column_name;
