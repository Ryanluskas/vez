/*
  ============================================================================
  A PENDÊNCIA PRECISA SABER TERMINAR

  Bug encontrado numa conversa real, e ele para o produto inteiro.

  A varredura do motor busca as pendências respondidas mais antigas, limite
  de 10, e pula as que já viraram rascunho. Só que "já virou rascunho" não
  mudava nada no banco: a linha continuava 'respondida' para sempre e
  continuava ocupando a janela das 10 mais antigas.

  Chegando à décima resposta na Fila, a janela fica cheia de trabalho já
  feito e NENHUMA resposta nova do consultor chega ao cliente. Nunca mais.
  Sem erro no log, sem alerta: ele responde no painel, o painel diz que
  está tudo certo, e o cliente não recebe nada.

  Foi exatamente o que aconteceu: a conta tinha 7 pendências antigas mais
  as 3 de um teste, deu 10, e a Fila parou.

  'concluida' é o estado que faltava — respondida E entregue. O painel não
  se importa (ele só olha 'aberta'), e a varredura passa a enxergar só o
  que ainda tem trabalho.
  ============================================================================
*/

alter table pendencias drop constraint if exists pendencias_status_check;

alter table pendencias
  add constraint pendencias_status_check
  check (status in ('aberta', 'respondida', 'concluida'));

/*
  Destrava o que já está preso: toda pendência respondida que JÁ virou
  rascunho está concluída por definição — o cliente recebeu.
*/
update pendencias p
   set status = 'concluida'
 where p.status = 'respondida'
   and exists (select 1 from rascunhos r where r.id_pendencia = p.id);

/* A varredura do motor lê por aqui. */
create index if not exists pendencias_a_processar
  on pendencias (respondida_em)
  where status = 'respondida';
