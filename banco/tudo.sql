-- Vez — banco completo. Cole tudo isto no SQL Editor do Supabase e rode uma vez.
-- Pode rodar de novo sem medo: tudo é 'if not exists' / 'drop policy if exists'.

-- =============================================================
-- Vez — tabelas
-- Rode este arquivo INTEIRO no SQL Editor do Supabase, e depois
-- o 02_rls.sql. Sem o 02, o banco fica aberto: nao pule.
--
-- Regra que vale para todas as tabelas: TODA linha tem user_id.
-- E o que separa um consultor do outro. Nada aqui e global.
-- =============================================================

-- -------------------------------------------------------------
-- conversas — uma por cliente (telefone), por consultor
-- -------------------------------------------------------------
create table if not exists public.conversas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  telefone        text not null,
  nome            text,
  estagio         text not null default 'aguardando_bot'
                    check (estagio in ('aguardando_bot','aguardando_voce','rascunho_pronto','respondido')),
  ultima_mensagem text,
  atualizado_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now(),
  unique (user_id, telefone)
);

comment on column public.conversas.estagio is
  'aguardando_bot = fluindo | aguardando_voce = congelada esperando o consultor | rascunho_pronto = tem resposta pra aprovar | respondido = fechada';

create index if not exists conversas_por_atualizacao
  on public.conversas (user_id, atualizado_em desc);

create index if not exists conversas_por_estagio
  on public.conversas (user_id, estagio);

-- -------------------------------------------------------------
-- mensagens — histórico bruto das duas pontas
-- -------------------------------------------------------------
create table if not exists public.mensagens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  id_conversa uuid not null references public.conversas (id) on delete cascade,
  direcao     text not null check (direcao in ('recebida','enviada')),
  texto       text not null,
  criado_em   timestamptz not null default now()
);

create index if not exists mensagens_por_conversa
  on public.mensagens (id_conversa, criado_em);

-- -------------------------------------------------------------
-- pendencias — A FILA. O coração do produto.
-- Uma linha aqui = um cliente parado esperando um número seu.
-- -------------------------------------------------------------
create table if not exists public.pendencias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  id_conversa uuid not null references public.conversas (id) on delete cascade,
  pergunta    text not null,
  contexto    text,
  status      text not null default 'aberta' check (status in ('aberta','respondida')),
  resposta    text,
  respondida_em timestamptz,
  criado_em   timestamptz not null default now()
);

comment on table public.pendencias is
  'A fila do painel. Sempre lida em ordem de criado_em ascendente: quem chegou primeiro e atendido primeiro.';

-- Índice desenhado para a consulta da fila:
-- select * from pendencias where status = 'aberta' order by criado_em
create index if not exists fila_aberta_por_chegada
  on public.pendencias (user_id, criado_em)
  where status = 'aberta';

-- -------------------------------------------------------------
-- rascunhos — o que o bot escreveu e ainda NAO foi enviado
-- -------------------------------------------------------------
create table if not exists public.rascunhos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  id_conversa    uuid not null references public.conversas (id) on delete cascade,
  texto_sugerido text not null,
  status         text not null default 'pendente'
                   check (status in ('pendente','aprovado','descartado')),
  criado_em      timestamptz not null default now()
);

create index if not exists rascunhos_pendentes
  on public.rascunhos (user_id, criado_em)
  where status = 'pendente';

-- -------------------------------------------------------------
-- respostas_boas — a memória do jeito de falar do consultor.
-- Nao e treinamento de modelo: sao exemplos que entram no prompt
-- (few-shot) na hora de escrever um rascunho novo da mesma categoria.
-- -------------------------------------------------------------
create table if not exists public.respostas_boas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  categoria        text not null,
  mensagem_cliente text not null,
  resposta_ryan    text not null,
  criado_em        timestamptz not null default now()
);

create index if not exists exemplos_por_categoria
  on public.respostas_boas (user_id, categoria, criado_em desc);

-- -------------------------------------------------------------
-- Realtime: o painel escuta estas duas para o contador da fila
-- subir sozinho quando o motor cria uma pendência.
-- -------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.pendencias;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.rascunhos;
  exception when duplicate_object then null;
  end;
end $$;


-- =============================================================
-- Vez — Row-Level Security
-- Rode DEPOIS do 01_tabelas.sql.
--
-- A regra e sempre a mesma nas cinco tabelas: a linha so existe
-- para quem e dono dela. Isso vale para o painel E para o motor
-- local, porque os dois falam com o banco usando a chave anon
-- e a sessao do proprio consultor.
--
-- 'select auth.uid()' vem entre parenteses de proposito: assim o
-- Postgres avalia uma vez por consulta em vez de uma vez por linha.
-- =============================================================

alter table public.conversas       enable row level security;
alter table public.mensagens       enable row level security;
alter table public.pendencias      enable row level security;
alter table public.rascunhos       enable row level security;
alter table public.respostas_boas  enable row level security;

-- -------------------------------------------------------------
-- conversas
-- -------------------------------------------------------------
drop policy if exists conversas_leitura   on public.conversas;
drop policy if exists conversas_insercao  on public.conversas;
drop policy if exists conversas_alteracao on public.conversas;
drop policy if exists conversas_remocao   on public.conversas;

create policy conversas_leitura on public.conversas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conversas_insercao on public.conversas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conversas_alteracao on public.conversas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conversas_remocao on public.conversas
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- mensagens
-- -------------------------------------------------------------
drop policy if exists mensagens_leitura   on public.mensagens;
drop policy if exists mensagens_insercao  on public.mensagens;
drop policy if exists mensagens_alteracao on public.mensagens;
drop policy if exists mensagens_remocao   on public.mensagens;

create policy mensagens_leitura on public.mensagens
  for select to authenticated using ((select auth.uid()) = user_id);

create policy mensagens_insercao on public.mensagens
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy mensagens_alteracao on public.mensagens
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy mensagens_remocao on public.mensagens
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- pendencias (a fila)
-- -------------------------------------------------------------
drop policy if exists pendencias_leitura   on public.pendencias;
drop policy if exists pendencias_insercao  on public.pendencias;
drop policy if exists pendencias_alteracao on public.pendencias;
drop policy if exists pendencias_remocao   on public.pendencias;

create policy pendencias_leitura on public.pendencias
  for select to authenticated using ((select auth.uid()) = user_id);

create policy pendencias_insercao on public.pendencias
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy pendencias_alteracao on public.pendencias
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pendencias_remocao on public.pendencias
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- rascunhos
-- -------------------------------------------------------------
drop policy if exists rascunhos_leitura   on public.rascunhos;
drop policy if exists rascunhos_insercao  on public.rascunhos;
drop policy if exists rascunhos_alteracao on public.rascunhos;
drop policy if exists rascunhos_remocao   on public.rascunhos;

create policy rascunhos_leitura on public.rascunhos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy rascunhos_insercao on public.rascunhos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy rascunhos_alteracao on public.rascunhos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy rascunhos_remocao on public.rascunhos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -------------------------------------------------------------
-- respostas_boas (o "Meu jeito")
-- -------------------------------------------------------------
drop policy if exists exemplos_leitura   on public.respostas_boas;
drop policy if exists exemplos_insercao  on public.respostas_boas;
drop policy if exists exemplos_alteracao on public.respostas_boas;
drop policy if exists exemplos_remocao   on public.respostas_boas;

create policy exemplos_leitura on public.respostas_boas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy exemplos_insercao on public.respostas_boas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy exemplos_alteracao on public.respostas_boas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy exemplos_remocao on public.respostas_boas
  for delete to authenticated using ((select auth.uid()) = user_id);

-- =============================================================
-- Conferencia. As cinco tabelas tem que aparecer com rls_ligado = true
-- e 4 politicas cada uma.
-- =============================================================
select
  c.relname                    as tabela,
  c.relrowsecurity             as rls_ligado,
  count(p.polname)             as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('conversas','mensagens','pendencias','rascunhos','respostas_boas')
group by c.relname, c.relrowsecurity
order by c.relname;


-- =============================================================
-- Vez — tabela de conexão (Fase 2)
-- Rode depois do 01 e do 02.
--
-- Uma linha por consultor. E a ponte entre o motor (que roda no PC
-- dele) e o painel (que roda na Vercel): o motor escreve aqui o que
-- esta acontecendo, e o painel le pra mostrar o QR e dizer a verdade
-- sobre o estado do motor.
-- =============================================================

create table if not exists public.conexoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  estado        text not null default 'desligado'
                  check (estado in ('desligado','iniciando','aguardando_qr','conectado')),
  -- QR ja renderizado como data URL pelo motor: o painel so mostra a imagem.
  qr            text,
  telefone      text,
  aparelho      text,
  detalhe       text,
  -- Batida de coração do motor. Sem ela, "conectado" mentiria depois de
  -- alguem simplesmente fechar o programa.
  visto_em      timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on column public.conexoes.visto_em is
  'Atualizado a cada 30s pelo motor. O painel so considera o motor ligado se visto_em for recente.';

alter table public.conexoes enable row level security;

drop policy if exists conexoes_leitura   on public.conexoes;
drop policy if exists conexoes_insercao  on public.conexoes;
drop policy if exists conexoes_alteracao on public.conexoes;
drop policy if exists conexoes_remocao   on public.conexoes;

create policy conexoes_leitura on public.conexoes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conexoes_insercao on public.conexoes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conexoes_alteracao on public.conexoes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conexoes_remocao on public.conexoes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime: o painel reage na hora que o QR aparece ou o motor conecta.
do $$
begin
  begin
    alter publication supabase_realtime add table public.conexoes;
  exception when duplicate_object then null;
  end;
end $$;

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'conexoes'
group by c.relname, c.relrowsecurity;


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


-- =============================================================
-- Vez — separar cliente de não-cliente (Fase 6)
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O motor nao tem como adivinhar quem e cliente: pro WhatsApp, a mae do
  consultor e um contato igual a qualquer outro. Entao o padrao e atender
  todo mundo — porque lead novo e justamente o que o produto existe pra
  pegar — e o consultor silencia na mao quem nao e cliente.

  Silenciar NAO apaga historico: as mensagens continuam sendo gravadas.
  So o cerebro para de rodar naquela conversa.
*/
alter table public.conversas
  add column if not exists atender boolean not null default true;

comment on column public.conversas.atender is
  'false = o bot nao classifica, nao cria pendencia e nao escreve rascunho nesta conversa. As mensagens continuam sendo gravadas.';

-- A consulta que o motor faz a cada mensagem recebida.
create index if not exists conversas_atendidas
  on public.conversas (user_id, telefone)
  where atender;

-- Conferencia
select column_name as coluna, column_default as padrao
from information_schema.columns
where table_schema = 'public' and table_name = 'conversas' and column_name = 'atender';


