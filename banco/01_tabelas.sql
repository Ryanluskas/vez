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
