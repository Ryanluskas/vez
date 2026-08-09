-- =============================================================
-- Vez — colunas das Fases 3, 4 e 5
-- Rode depois do 01, 02 e 03. Pode rodar de novo sem medo.
-- =============================================================

-- rascunhos ganha tres coisas:
--   categoria     = pra saber em qual gaveta do "Meu jeito" guardar quando aprovar
--   id_pendencia  = de qual pergunta da fila esse rascunho nasceu (pode ser nula)
--   enviado_em    = carimbo do envio, so o motor escreve
alter table public.rascunhos add column if not exists categoria     text;
alter table public.rascunhos add column if not exists id_pendencia  uuid references public.pendencias (id) on delete set null;
alter table public.rascunhos add column if not exists enviado_em    timestamptz;

comment on column public.rascunhos.enviado_em is
  'So preenchido pelo motor, depois que o WhatsApp confirmou. Rascunho aprovado com enviado_em nulo = ainda na fila de envio.';

-- A pendencia guarda a categoria que o classificador deu, pra resposta
-- do consultor entrar no "Meu jeito" na gaveta certa.
alter table public.pendencias add column if not exists categoria text;

-- E guarda POR QUE travou, em portugues. O consultor tem o direito de saber
-- se foi a regra rigida ("falou em parcela") ou a IA ("depende de um dado seu").
alter table public.pendencias add column if not exists motivo text;

-- O motor fica de olho nestas duas filas de trabalho:
--   1. pendencias que o consultor acabou de responder -> virar rascunho
--   2. rascunhos aprovados que ainda nao foram enviados -> mandar no WhatsApp
create index if not exists pendencias_respondidas
  on public.pendencias (user_id, respondida_em)
  where status = 'respondida';

create index if not exists rascunhos_para_enviar
  on public.rascunhos (user_id, criado_em)
  where status = 'aprovado' and enviado_em is null;

-- Realtime: o motor reage na hora que voce responde ou aprova,
-- em vez de ficar perguntando ao banco de tempos em tempos.
do $$
begin
  begin
    alter publication supabase_realtime add table public.respostas_boas;
  exception when duplicate_object then null;
  end;
end $$;

-- Conferencia
select
  table_name  as tabela,
  column_name as coluna
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'rascunhos'  and column_name in ('categoria','id_pendencia','enviado_em'))
    or (table_name = 'pendencias' and column_name = 'categoria')
  )
order by table_name, column_name;
