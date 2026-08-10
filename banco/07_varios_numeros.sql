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
