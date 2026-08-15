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
