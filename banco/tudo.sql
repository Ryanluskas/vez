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


-- =============================================================
-- Vez — vários números de WhatsApp na mesma conta
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui `conexoes` tinha uma linha por consultor: um WhatsApp, uma conta.
  Consultor de verdade tem numero comercial, numero antigo que ainda recebe
  cliente, as vezes um por convenio. Agora sao varias linhas por consultor,
  e cada conversa sabe por qual numero ela entrou.
*/

-- ---------- conexoes: de uma por conta para varias ----------
alter table public.conexoes drop constraint if exists conexoes_user_id_key;

alter table public.conexoes add column if not exists apelido text;
alter table public.conexoes add column if not exists ativa boolean not null default true;

-- O painel levanta a bandeira; o motor ve e desconecta aquele numero.
-- E o unico jeito: o painel roda na Vercel e nao alcanca a maquina do dono.
alter table public.conexoes add column if not exists desconectar_pedido boolean not null default false;

update public.conexoes set apelido = 'Principal' where apelido is null;
alter table public.conexoes alter column apelido set default 'Principal';
alter table public.conexoes alter column apelido set not null;

create unique index if not exists conexoes_apelido_unico
  on public.conexoes (user_id, apelido);

comment on column public.conexoes.desconectar_pedido is
  'true = o consultor pediu desconexao no painel. O motor desconecta, apaga a sessao e volta a false.';

-- ---------- conversas: cada uma pertence a um numero ----------
alter table public.conversas
  add column if not exists id_conexao uuid references public.conexoes (id) on delete set null;

-- O mesmo cliente pode escrever para dois numeros seus. Sao duas conversas.
alter table public.conversas drop constraint if exists conversas_user_id_telefone_key;

-- Adota as conversas antigas na primeira conexao que existir.
update public.conversas c
set id_conexao = (
  select x.id from public.conexoes x where x.user_id = c.user_id order by x.atualizado_em limit 1
)
where c.id_conexao is null;

create unique index if not exists conversas_por_conexao
  on public.conversas (user_id, id_conexao, telefone) nulls not distinct;

create index if not exists conversas_da_conexao
  on public.conversas (id_conexao, atualizado_em desc);

-- Conferencia
select
  (select count(*) from public.conexoes)                          as conexoes,
  (select count(*) from public.conversas where id_conexao is null) as conversas_sem_numero;


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


-- =============================================================
-- Vez — WhatsApp migrou os identificadores para LID
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O WhatsApp trocou o identificador das conversas: em vez de
  "5562995598124@c.us" (o telefone), agora usa "13916230930575@lid" — um id
  que nao revela o numero. Medido nesta conta: 102 de 105 conversas ja sao
  @lid, so 1 continua @c.us.

  O telefone real continua acessivel (contact.phoneNumber), entao ele segue
  sendo o que o consultor ve. Mas pra FALAR com a conversa e preciso o id
  original — reconstruir "telefone@c.us" nao funciona pra contato que so
  existe como @lid.
*/
alter table public.conversas add column if not exists id_chat text;

comment on column public.conversas.id_chat is
  'Identificador da conversa no WhatsApp (13916...@lid ou 5562...@c.us). E por ele que o motor envia; o telefone e so pra voce ler.';

create index if not exists conversas_por_id_chat
  on public.conversas (id_conexao, id_chat);

-- Conferencia
select column_name as coluna
from information_schema.columns
where table_schema = 'public' and table_name = 'conversas' and column_name = 'id_chat';


-- =============================================================
-- Vez — respostas curinga
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O consultor responde a mesma coisa o dia inteiro: "vou verificar",
  "sem margem", "o banco negou". Digitar isso vinte vezes por dia e o tipo
  de atrito que faz largar a ferramenta e voltar pro WhatsApp puro.

  Atalho NAO envia sozinho: clicar preenche a caixa de resposta. O que sai
  continua passando pelo mesmo caminho — vira rascunho e espera aprovacao.
  Um clique que dispara mensagem seria facil de errar com a mao.
*/
create table if not exists public.atalhos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  titulo    text not null,
  texto     text not null,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists atalhos_do_usuario
  on public.atalhos (user_id, ordem, criado_em);

alter table public.atalhos enable row level security;

drop policy if exists atalhos_leitura   on public.atalhos;
drop policy if exists atalhos_insercao  on public.atalhos;
drop policy if exists atalhos_alteracao on public.atalhos;
drop policy if exists atalhos_remocao   on public.atalhos;

create policy atalhos_leitura on public.atalhos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy atalhos_insercao on public.atalhos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy atalhos_alteracao on public.atalhos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy atalhos_remocao on public.atalhos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'atalhos'
group by c.relname, c.relrowsecurity;


-- =============================================================
-- Vez — o que o bot sabe sobre a sua operação
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui o bot tinha o TOM do consultor (respostas_boas) mas nao sabia
  NADA do negocio: que empresa e, com que bancos trabalha, como funciona a
  portabilidade com reducao de taxa, que documentos pedir. Entao respondia
  como atendente generico de banco.

  Isto e diferente de respostas_boas: la sao exemplos de COMO falar; aqui
  sao fatos sobre O QUE e verdade.

  REGRA: nada de valor, taxa ou parcela aqui. Esses numeros mudam por
  cliente, e se estivessem neste texto o bot passaria a cita-los sozinho —
  furando a regra de ouro por uma porta lateral. O painel recusa na hora
  de salvar.
*/
create table if not exists public.conhecimento (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  assunto   text not null,
  conteudo  text not null,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists conhecimento_do_usuario
  on public.conhecimento (user_id, ordem, criado_em);

alter table public.conhecimento enable row level security;

drop policy if exists conhecimento_leitura   on public.conhecimento;
drop policy if exists conhecimento_insercao  on public.conhecimento;
drop policy if exists conhecimento_alteracao on public.conhecimento;
drop policy if exists conhecimento_remocao   on public.conhecimento;

create policy conhecimento_leitura on public.conhecimento
  for select to authenticated using ((select auth.uid()) = user_id);

create policy conhecimento_insercao on public.conhecimento
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy conhecimento_alteracao on public.conhecimento
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy conhecimento_remocao on public.conhecimento
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  c.relname        as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.polname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relname = 'conhecimento'
group by c.relname, c.relrowsecurity;


