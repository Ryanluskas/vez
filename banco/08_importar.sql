-- =============================================================
-- Vez — importar conversas que já estavam no WhatsApp
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O motor só enxerga o que chega depois que ele liga. Cliente que escreveu
  ontem, com o motor desligado, nao existe pro produto. Esta importacao
  traz esse passado pra dentro.

  Regra que sustenta tudo: importar NAO responde nada. As conversas entram
  como 'novo' — etapa que o follow-up nao cobra — porque cobrar alguem que
  falou com voce semana passada, sem contexto, e o jeito mais rapido de
  queimar a lista.
*/

-- O painel pede; o motor obedece. 0 = nada a fazer.
alter table public.conexoes
  add column if not exists importar_dias int not null default 0;

comment on column public.conexoes.importar_dias is
  'Quantos dias de historico o consultor pediu pra importar. O motor zera depois de importar.';

-- Quem falou por ultimo. E o que separa "cliente esperando voce" de
-- "conversa que voce ja fechou" numa lista de 200 importadas.
alter table public.conversas
  add column if not exists ultima_direcao text
    check (ultima_direcao in ('recebida','enviada'));

/*
  Id da mensagem no WhatsApp. Sem isto, importar duas vezes duplica todo o
  historico — e o consultor ia importar duas vezes, porque a primeira ele
  faz sem entender direito o que vai acontecer.
*/
alter table public.mensagens add column if not exists id_whatsapp text;

create unique index if not exists mensagens_sem_repetir
  on public.mensagens (user_id, id_whatsapp)
  where id_whatsapp is not null;

create index if not exists conversas_sem_resposta
  on public.conversas (user_id, atualizado_em desc)
  where ultima_direcao = 'recebida';

-- Conferencia
select column_name as coluna
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'conexoes'  and column_name = 'importar_dias')
    or (table_name = 'conversas' and column_name = 'ultima_direcao')
    or (table_name = 'mensagens' and column_name = 'id_whatsapp')
  )
order by column_name;
