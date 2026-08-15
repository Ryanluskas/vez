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
