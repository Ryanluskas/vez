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
