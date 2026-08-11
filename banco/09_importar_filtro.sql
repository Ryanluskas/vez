-- =============================================================
-- Vez — importação com filtro e progresso
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Cortar em 200 pelas mais recentes e arbitrario: quem tem 800 conversas
  perde 600 sem saber quais. Melhor deixar o consultor escolher O QUE
  importar, e mostrar o progresso enquanto roda.
*/
alter table public.conexoes
  add column if not exists importar_filtro text not null default 'todas'
    check (importar_filtro in ('todas', 'sem_resposta'));

comment on column public.conexoes.importar_filtro is
  'todas = tudo do periodo | sem_resposta = so conversas onde o cliente falou por ultimo';

-- Progresso da importacao, escrito pelo motor enquanto roda.
-- Sem isto o painel so consegue dizer "pedi" e "acabou", e uma importacao
-- de 30 dias parece travada.
alter table public.conexoes add column if not exists importar_total int;
alter table public.conexoes add column if not exists importar_feitas int;

-- Conferencia
select column_name as coluna
from information_schema.columns
where table_schema = 'public' and table_name = 'conexoes'
  and column_name in ('importar_dias','importar_filtro','importar_total','importar_feitas')
order by column_name;
