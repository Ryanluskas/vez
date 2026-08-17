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


-- =============================================================
-- Vez — modo autônomo
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui todo rascunho esperava aprovacao. O objetivo do produto e outro:
  o bot fecha com o cliente enquanto o consultor faz outra coisa, e so
  pergunta o que so ele sabe.

  O que torna isso seguro nao e a aprovacao — e a regra de ouro. Pergunta
  de valor nunca vira rascunho, entao nunca chega perto de sair sozinha.
  O modo autonomo libera apenas as categorias que o consultor marcar, e
  'valor' nao pode ser marcada.
*/
create table if not exists public.preferencias (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  modo_autonomo boolean not null default false,
  categorias    text[] not null default array['saudacao','documentos','prazo','horario','acompanhamento'],
  atualizado_em timestamptz not null default now()
);

comment on column public.preferencias.categorias is
  'Categorias que podem sair sem aprovacao. "valor" nunca entra aqui — e barrada no painel e no motor.';

alter table public.preferencias enable row level security;

drop policy if exists preferencias_leitura   on public.preferencias;
drop policy if exists preferencias_insercao  on public.preferencias;
drop policy if exists preferencias_alteracao on public.preferencias;

create policy preferencias_leitura on public.preferencias
  for select to authenticated using ((select auth.uid()) = user_id);

create policy preferencias_insercao on public.preferencias
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy preferencias_alteracao on public.preferencias
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/*
  Marca o que saiu sozinho. Serve pra duas coisas: o consultor consegue ver
  no historico o que ele nao leu antes de sair, e o aprendizado ignora essas
  mensagens — aprender com texto que ninguem conferiu compoe erro em cima
  de erro.
*/
alter table public.rascunhos add column if not exists automatico boolean not null default false;

-- Conferencia
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='rascunhos' and column_name='automatico') as coluna_automatico,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='preferencias') as tabela_preferencias;


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


-- =============================================================
-- Vez — três modos de operação
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  O interruptor binario (modo_autonomo) virou tres modos:

    manual     tudo espera aprovacao. E o que existia antes de tudo.
    assistido  decisao de alta confianca sai sozinha; o resto vira rascunho.
    autonomo   sai sozinho sempre que a categoria estiver liberada.

  "Confianca" aqui NAO e o modelo se auto-avaliando — isso seria numero
  decorativo. E quao deterministica foi a decisao: 1.0 quando saiu de regra
  rigida, 0.8 do classificador, 0.5 quando ele nao soube encaixar. O modo
  assistido corta em 0.8, entao ele deixa passar o que o codigo decidiu e
  segura o que dependeu de palpite do modelo.
*/
alter table public.preferencias
  add column if not exists modo text not null default 'manual'
    check (modo in ('manual','assistido','autonomo'));

-- Quem ja tinha o interruptor ligado vira autonomo; o resto, manual.
update public.preferencias
set modo = case when modo_autonomo then 'autonomo' else 'manual' end
where modo = 'manual' and modo_autonomo;

comment on column public.preferencias.modo is
  'manual | assistido | autonomo. modo_autonomo fica como espelho para nao quebrar o que le a coluna antiga.';

-- Conferencia
select modo, modo_autonomo, categorias from public.preferencias;



-- =============================================================
-- Vez — handoff que fecha o ciclo
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  De onde veio o rascunho. Muda quem precisa conferir antes de sair:

    'bot'       o bot escreveu sozinho. Depende do modo (manual/assistido/
                autonomo) pra sair ou virar rascunho.

    'consultor' nasceu de uma resposta que VOCE deu na Fila. Sai sem
                segunda aprovacao — voce ja aprovou quando respondeu. Pedir
                duas confirmacoes pro mesmo dado e o atrito que faz largar
                a ferramenta.

  A seguranca aqui nao e a aprovacao, e a conferencia de procedencia: todo
  numero do texto tem que estar na SUA resposta. Se a IA acrescentar
  qualquer outro, o rascunho e recusado e o que sai e o seu texto cru.
*/
alter table public.rascunhos
  add column if not exists origem text not null default 'bot'
    check (origem in ('bot','consultor'));

/*
  Quantas vezes esta conversa ja foi parar na sua mao. E o freio do loop:
  cliente que gerou tres pendencias sem o caso andar nao vai ser resolvido
  na quarta pelo bot — ou ele quer algo que a operacao nao faz, ou tem
  ruido que so gente desfaz.
*/
alter table public.conversas
  add column if not exists escalonamentos int not null default 0;

comment on column public.conversas.escalonamentos is
  'Zera quando o consultor responde e o cliente volta a falar. Serve de freio contra escalar em circulo.';

/*
  Quando o freio pega, a conversa fica SUA. O bot continua gravando tudo,
  mas nao decide mais nada ali ate voce devolver pelo painel.

  Nao da pra reaproveitar `atender` pra isso: atender=false quer dizer "nao
  e cliente" e some da lista principal. Esta e o contrario — e cliente
  demais, e precisa ficar visivel na sua frente.

  Nao se solta sozinha, de proposito. Se soltasse quando voce responde, o
  freio nunca travaria de verdade: bastava responder pra recomecar a contar
  do zero e o ping-pong voltava a cada quatro rodadas.
*/
alter table public.conversas
  add column if not exists so_voce boolean not null default false;

comment on column public.conversas.so_voce is
  'true = o bot so grava nesta conversa. Ligado pelo freio de loop, desligado por voce no painel.';

create index if not exists rascunhos_do_consultor
  on public.rascunhos (user_id, criado_em)
  where origem = 'consultor' and enviado_em is null;

-- Conferencia
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='rascunhos' and column_name='origem') as coluna_origem,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='conversas' and column_name='escalonamentos') as coluna_escalonamentos,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='conversas' and column_name='so_voce') as coluna_so_voce;


-- =============================================================
-- Vez — o que o agente fez, e quando
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Uma linha por ferramenta executada. Serve pra uma pergunta que hoje nao
  tem resposta: "por que o bot fez isso ontem as 14h?".

  Sem este registro, a unica pista e o log no terminal da maquina do
  consultor — que ele fecha, que rola pra cima e some, e que nao existe
  mais quando o problema aparece dois dias depois.

  O QUE NAO ENTRA AQUI: valor, parcela, taxa, saldo. Os argumentos das
  ferramentas ja sao barrados no codigo (ferramentas.js, `semDinheiro`),
  entao esta tabela nunca deveria ver um numero desses. Se um dia vir, o
  bug esta la, nao aqui.

  Ela cresce rapido: uma linha por acao, varias por mensagem. Por isso o
  indice e por (user_id, criado_em desc) — a consulta que importa e
  "o que aconteceu agora", nunca "tudo que ja aconteceu".
*/
create table if not exists public.acoes_do_agente (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  id_conversa uuid references public.conversas (id) on delete cascade,

  ferramenta  text not null,
  argumentos  jsonb not null default '{}'::jsonb,

  ok          boolean not null default true,
  erro        text,
  -- Quanto demorou. E como se descobre qual ferramenta esta segurando o bot.
  ms          int,

  criado_em   timestamptz not null default now()
);

comment on table public.acoes_do_agente is
  'Registro das ferramentas executadas pelo agente. Nunca guarda valor, parcela nem taxa.';

create index if not exists acoes_recentes
  on public.acoes_do_agente (user_id, criado_em desc);

create index if not exists acoes_da_conversa
  on public.acoes_do_agente (id_conversa, criado_em desc);

alter table public.acoes_do_agente enable row level security;

drop policy if exists acoes_leitura   on public.acoes_do_agente;
drop policy if exists acoes_insercao  on public.acoes_do_agente;
drop policy if exists acoes_alteracao on public.acoes_do_agente;
drop policy if exists acoes_remocao   on public.acoes_do_agente;

create policy acoes_leitura on public.acoes_do_agente
  for select to authenticated using ((select auth.uid()) = user_id);

create policy acoes_insercao on public.acoes_do_agente
  for insert to authenticated with check ((select auth.uid()) = user_id);

/*
  Sem policy de update: registro que pode ser reescrito nao serve de
  registro. Remocao existe so pra faxina — a tabela cresce sozinha.
*/
create policy acoes_remocao on public.acoes_do_agente
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='acoes_do_agente') as tabela,
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='acoes_do_agente') as politicas;


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


-- =============================================================
-- Vez — listas de clientes: a primeira fonte real de valor
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  Ate aqui NENHUM numero de dinheiro existia dentro do produto. A regra de
  ouro dizia: valor vem do consultor, nunca do modelo. A ferramenta
  `consultar_simulacao` existia so pra responder "nao tenho esse dado".

  A lista muda isso — e nao afrouxa a regra, cumpre ela. O valor continua
  nao vindo do modelo: vem de uma planilha que o consultor subiu, com dados
  que ele apurou. O modelo continua decidindo COMO falar, nunca QUAL e o
  numero.

  O que NAO muda: sem lista, ou com o cliente fora dela, tudo funciona
  exatamente como antes — a pergunta vai pra Fila. A lista e um atalho,
  nunca uma dependencia.
*/

create table if not exists public.listas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  nome        text not null,
  arquivo     text,
  linhas      int not null default 0,

  -- Desligar sem apagar: a lista de marco pode voltar a valer em abril.
  ativa       boolean not null default true,

  criado_em   timestamptz not null default now()
);

comment on table public.listas is
  'Planilhas de clientes que o consultor subiu. Fonte real de valor — a unica que existe.';

/*
  Uma linha por cliente da planilha.

  O telefone e guardado de duas formas de proposito. `telefone` e o numero
  inteiro montado como 55+DDD+celular; `telefone_curto` sao os ultimos 8
  digitos. O WhatsApp as vezes entrega o numero sem o nono digito, as vezes
  com, e as vezes com o 55 e as vezes sem — casar so pelo numero inteiro
  perderia cliente de verdade.

  Os campos ficam num jsonb porque a planilha tem 85 colunas e ate 15
  contratos por pessoa. Coluna a coluna seria uma migration a cada planilha
  nova com formato diferente.
*/
create table if not exists public.lista_clientes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  id_lista       uuid not null references public.listas (id) on delete cascade,

  nome           text,
  cpf            text,
  telefone       text,
  telefone_curto text,

  dados          jsonb not null default '{}'::jsonb,

  criado_em      timestamptz not null default now()
);

comment on table public.lista_clientes is
  'Uma linha por cliente da planilha. `dados` guarda a planilha inteira; o motor le so os campos liberados.';

-- A consulta que o motor faz a cada pergunta de valor.
create index if not exists lista_clientes_por_telefone
  on public.lista_clientes (user_id, telefone);

create index if not exists lista_clientes_por_curto
  on public.lista_clientes (user_id, telefone_curto);

create index if not exists lista_clientes_da_lista
  on public.lista_clientes (id_lista);

/* -------------------------------------------------------------
   O que o bot pode falar, e por quanto
------------------------------------------------------------- */

/*
  Nem todo campo da planilha deve chegar ao cliente. Margem livre, por
  exemplo, e informacao que o consultor as vezes prefere nao adiantar.
  Campo fora desta lista simplesmente nao existe para o bot.

  Comeca VAZIO de proposito: subir uma planilha nao pode, sozinho, fazer o
  bot sair falando saldo de ninguem. Quem liga cada campo e o consultor.
*/
alter table public.preferencias
  add column if not exists campos_da_lista text[] not null default '{}';

comment on column public.preferencias.campos_da_lista is
  'Campos da planilha que o bot pode falar. Vazio = a lista existe mas o bot nao fala nada dela.';

/*
  A porcentagem da reducao que o bot oferece ao cliente.

  100 = fala o valor cheio da planilha. 66 = fala 66% dele. E multiplicacao,
  nao divisao: 66% de 100 e 66.

  Guardado como int simples porque e assim que o consultor pensa nele — "eu
  passo 66" — e porque fracao de porcentagem aqui nao muda nada.
*/
alter table public.preferencias
  add column if not exists porcentagem_reducao int not null default 100
    check (porcentagem_reducao between 1 and 100);

comment on column public.preferencias.porcentagem_reducao is
  'Percentual da Reducao_Total que o bot oferece. 100 = valor cheio da planilha.';

/* -------------------------------------------------------------
   De onde veio o rascunho
------------------------------------------------------------- */

/*
  Rascunho nascido da lista NAO sai sozinho, mesmo em modo autonomo. O dado
  e real, mas ninguem conferiu SE e o dado daquela pessoa — a planilha casa
  por telefone, e telefone trocado na planilha vira saldo de um cliente
  indo pro outro.

  Uma aprovacao antes do primeiro numero sair custa segundos. O contrario
  custa um cliente.
*/
alter table public.rascunhos drop constraint if exists rascunhos_origem_check;

alter table public.rascunhos
  add constraint rascunhos_origem_check
  check (origem in ('bot','consultor','lista'));

/* -------------------------------------------------------------
   RLS
------------------------------------------------------------- */

alter table public.listas          enable row level security;
alter table public.lista_clientes  enable row level security;

drop policy if exists listas_leitura   on public.listas;
drop policy if exists listas_insercao  on public.listas;
drop policy if exists listas_alteracao on public.listas;
drop policy if exists listas_remocao   on public.listas;

create policy listas_leitura on public.listas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy listas_insercao on public.listas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy listas_alteracao on public.listas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy listas_remocao on public.listas
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists lista_clientes_leitura   on public.lista_clientes;
drop policy if exists lista_clientes_insercao  on public.lista_clientes;
drop policy if exists lista_clientes_remocao   on public.lista_clientes;

create policy lista_clientes_leitura on public.lista_clientes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy lista_clientes_insercao on public.lista_clientes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy lista_clientes_remocao on public.lista_clientes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Conferencia
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='listas') as tabela_listas,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='lista_clientes') as tabela_clientes,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='preferencias' and column_name='porcentagem_reducao') as coluna_porcentagem;
