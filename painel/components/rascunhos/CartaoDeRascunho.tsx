"use client";

import { useActionState, useState } from "react";
import {
  aprovarRascunho,
  descartarRascunho,
  type Resultado,
} from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  A tela de aprovação. É a última porta antes da mensagem sair da máquina
  do consultor — por isso o texto vem num campo editável, não num balão de
  leitura. O que ele lê aqui é literalmente o que o cliente vai receber.
*/
export function CartaoDeRascunho({
  id,
  nome,
  telefone,
  categoria,
  origem,
  textoSugerido,
  perguntaOriginal,
}: {
  id: string;
  nome: string;
  telefone: string;
  categoria: string | null;
  /* De onde veio o numero: bot, sua resposta na Fila, ou uma lista. */
  origem?: string | null;
  textoSugerido: string;
  perguntaOriginal: string | null;
}) {
  const [texto, setTexto] = useState(textoSugerido);
  const [aprovacao, aprovar, aprovando] = useActionState(
    aprovarRascunho,
    {} as Resultado
  );
  const [descarte, descartar, descartando] = useActionState(
    descartarRascunho,
    {} as Resultado
  );

  const editado = texto.trim() !== textoSugerido.trim();

  if (aprovacao.ok) {
    return (
      <article className="border-t border-fio py-4">
        <p className="text-[13px] text-jade">
          Aprovado para {nome}. O motor envia em alguns segundos.
        </p>
      </article>
    );
  }

  if (descarte.ok) {
    return (
      <article className="border-t border-fio py-4">
        <p className="text-[13px] text-texto3">
          Descartado. A conversa de {nome} voltou para o bot.
        </p>
      </article>
    );
  }

  return (
    <article className="border-t border-fio py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[14px] text-texto">{nome}</span>
        <span className="num text-[12px] text-texto3">{telefone}</span>
        {categoria ? <span className="rotulo">{categoria}</span> : null}

        {/* De onde saiu o numero. Vale a tela porque muda o que voce confere:
            num rascunho da lista, o que se confere e se o cliente e mesmo
            aquela pessoa — a planilha casa por telefone. */}
        {origem === "lista" ? (
          <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-jade">
            valores da lista
          </span>
        ) : null}
      </div>

      {perguntaOriginal ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
          <span className="text-texto3">Cliente: </span>
          {perguntaOriginal}
        </p>
      ) : null}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={Math.min(8, Math.max(3, Math.ceil(texto.length / 60)))}
        aria-label={`Mensagem para ${nome}`}
        className={cn(
          "mt-2.5 w-full resize-y rounded-md border border-fio bg-sup px-3 py-2.5",
          "text-[14px] leading-relaxed text-texto transition-colors",
          "hover:border-fio-forte focus:border-jade focus:outline-none"
        )}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={aprovar}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="texto" value={texto} />
          <button
            type="submit"
            disabled={aprovando || descartando || !texto.trim()}
            className={cn(
              "h-9 rounded-md bg-jade px-3.5 text-[13px] font-medium text-jade-texto",
              "transition-colors hover:bg-jade-forte disabled:opacity-45"
            )}
          >
            {aprovando ? "Enviando…" : "Aprovar e enviar"}
          </button>
        </form>

        <form action={descartar}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={aprovando || descartando}
            className={cn(
              "h-9 rounded-md border border-fio bg-transparent px-3.5 text-[13px] text-texto2",
              "transition-colors hover:border-fio-forte hover:text-texto disabled:opacity-45"
            )}
          >
            Descartar
          </button>
        </form>

        {editado ? (
          <span className="text-[11px] text-texto3">
            Você editou — o bot vai aprender a sua versão.
          </span>
        ) : null}
      </div>

      {aprovacao.erro || descarte.erro ? (
        <p role="alert" className="mt-2 text-[12px] text-erro">
          {aprovacao.erro ?? descarte.erro}
        </p>
      ) : null}
    </article>
  );
}
