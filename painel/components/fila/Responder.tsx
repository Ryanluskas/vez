"use client";

import { useActionState } from "react";
import { responderPendencia, type Resultado } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  A caixa de resposta da fila. O consultor digita o dado cru — o número que
  só ele tem — e o motor embrulha isso numa mensagem no tom dele, que volta
  como rascunho pra aprovar. Ele nunca escreve a mensagem inteira aqui.
*/
export function Responder({ idPendencia }: { idPendencia: string }) {
  const [estado, enviar, pendente] = useActionState(
    responderPendencia,
    {} as Resultado
  );

  if (estado.ok) {
    return (
      <p className="mt-3 text-[13px] text-jade">
        Anotado. O bot está escrevendo — daqui a pouco aparece em Rascunhos.
      </p>
    );
  }

  return (
    <form action={enviar} className="mt-3">
      <input type="hidden" name="id" value={idPendencia} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="resposta"
          required
          autoComplete="off"
          placeholder="R$ 4.200, em 12x de 380"
          disabled={pendente}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md border border-fio bg-sup px-3 text-[13px] text-texto",
            "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none"
          )}
        />
        <button
          type="submit"
          disabled={pendente}
          className={cn(
            "h-9 shrink-0 rounded-md bg-jade px-3.5 text-[13px] font-medium text-jade-texto",
            "transition-colors hover:bg-jade-forte disabled:opacity-45"
          )}
        >
          {pendente ? "Anotando…" : "Responder"}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-texto3">
        Escreva só o dado. O bot monta a mensagem no seu jeito e você aprova antes de
        sair.
      </p>

      {estado.erro ? (
        <p role="alert" className="mt-2 text-[12px] text-erro">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
