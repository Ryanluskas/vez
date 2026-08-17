-- =============================================================
-- Vez — estado comercial da conversa
-- Rode depois dos outros. Pode rodar de novo sem medo.
-- =============================================================

/*
  A memoria guardava fatos soltos do cliente — nome, convenio, banco. Nao
  guardava ONDE a conversa estava.

  O sintoma foi este, numa conversa real de prospeccao:

    BOT:     Oi Ademar, aqui e o Ryan. Vi que seu contrato Santander tem
             margem pra reduzir a taxa e liberar um valor pra voce...
    CLIENTE: Preciso saber se ainda libera pra mim
    BOT:     Voce e aposentado do INSS ou servidor? Em qual banco esta
             seu emprestimo?

  O bot perguntou o banco que ELE MESMO tinha acabado de citar. Do lado do
  cliente isso nao e "faltou um dado" — e nao ter ninguem prestando atencao.

  Duas causas, e as duas viram coluna aqui:

  1. O bot so aprendia com o que o CLIENTE dizia. A propria abordagem
     carregava nome e banco, e isso se perdia.

  2. Nao existia etapa comercial. "Falta contracheque" e verdade pra
     fechar, e e conversa errada quando o assunto ainda e a simulacao.
*/

/* -------------------------------------------------------------
   Onde a conversa esta, comercialmente
------------------------------------------------------------- */

/*
  Diferente de `conversas.etapa` (o funil, que o consultor move na mao) e
  de `conversas.estagio` (onde a MENSAGEM esta). Esta e a etapa da
  NEGOCIACAO, e quem move e o proprio agente:

    prospeccao  o bot abordou, o cliente ainda nao respondeu
    interesse   ele respondeu e quer saber mais
    simulacao   o assunto e o numero — e ele so vem de voce ou da lista
    documentos  a simulacao andou e agora falta papel
    fechamento  documentos na mao, faltam os dados finais
*/
alter table public.memoria
  add column if not exists etapa_comercial text not null default 'interesse'
    check (etapa_comercial in
      ('prospeccao','interesse','simulacao','documentos','fechamento'));

comment on column public.memoria.etapa_comercial is
  'Onde a NEGOCIACAO esta. Decide o que faz sentido perguntar agora — pedir contracheque durante a conversa de simulacao e conversa errada.';

/*
  Como esta conversa comecou.

  'prospeccao' = o consultor abordou primeiro, ja sabendo do contrato. Isso
  muda o que falta: ele nao precisa perguntar o banco de alguem que ele
  procurou POR CAUSA do contrato naquele banco.

  'entrada' = o cliente chegou sozinho. Aí nao se sabe nada dele.
*/
alter table public.memoria
  add column if not exists origem text not null default 'entrada'
    check (origem in ('prospeccao','entrada'));

/* -------------------------------------------------------------
   A simulacao — e a unica excecao a "memoria nao guarda valor"
------------------------------------------------------------- */

/*
  ATENCAO: ate aqui esta tabela NUNCA guardou numero de dinheiro, e o
  motivo era bom — valor muda a cada simulacao, e memoria com numero velho
  faz o bot repetir valor vencido.

  O que muda: quando o consultor responde na Fila "4200 em 12x de 380", ou
  quando o valor vem da lista que ele subiu, esse numero JA foi dito ao
  cliente. Ele existe na conversa. E quando o cliente escreve "voce ja me
  disse o valor", o bot precisa saber qual foi — senao pergunta de novo o
  que ele mesmo respondeu ha dez minutos.

  O QUE PROTEGE ISSO, e por que nao fura a regra de ouro:

    - `de` guarda a procedencia, e so aceita 'consultor' ou 'lista'.
      Modelo nao escreve aqui. Nunca.
    - `em` guarda quando. Valor velho da pra reconhecer e recusar.
    - o validador continua conferindo procedencia na saida: numero no
      rascunho tem que estar nesta fonte, senao e invencao.

  Guardar o que VOCE disse nao e o mesmo que deixar a IA inventar. E o
  contrario: e o que permite recusar tudo que nao seja isto.
*/
alter table public.memoria
  add column if not exists simulacao jsonb not null default '{}'::jsonb;

comment on column public.memoria.simulacao is
  'O que JA foi dito ao cliente: {valor, parcela, taxa, de: consultor|lista, em}. Escrito so por resposta do consultor ou pela lista — nunca pelo modelo.';

/* -------------------------------------------------------------
   O fio da conversa
------------------------------------------------------------- */

/*
  O que o cliente pediu por ultimo, e o que o bot esta esperando. Sem isso,
  "aquele valor" nao tem a que se referir: cada mensagem chegava como se
  fosse a primeira.
*/
alter table public.memoria
  add column if not exists ultima_intencao text;

alter table public.memoria
  add column if not exists aguardando text;

comment on column public.memoria.aguardando is
  'O que o bot espera do cliente agora: resposta_da_abordagem, documento, confirmacao. Null = nada pendente.';

-- Conferencia
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='memoria' and column_name='etapa_comercial') as etapa,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='memoria' and column_name='simulacao') as simulacao,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='memoria' and column_name='origem') as origem;
