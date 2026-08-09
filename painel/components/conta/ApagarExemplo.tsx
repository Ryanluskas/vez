"use client";

import { useActionState } from "react";
import { apagarExemplo, type Resultado } from "@/lib/acoes-painel";

/*
  Apagar um exemplo é o único jeito de o consultor desensinar o bot.
  Se uma resposta ruim virou exemplo, ela contamina todas as próximas
  da mesma categoria — então isso precisa estar à mão, não escondido.
*/
export function ApagarExemplo({ id }: { id: string }) {
  const [estado, apagar, apagando] = useActionState(apagarExemplo, {} as Resultado);

  if (estado.ok) {
    return <span className="text-[11px] text-texto3">Apagado</span>;
  }

  return (
    <form action={apagar}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={apagando}
        className="rounded-md text-[11px] text-texto3 transition-colors hover:text-erro disabled:opacity-45"
      >
        {apagando ? "Apagando…" : "Apagar"}
      </button>
      {estado.erro ? (
        <span role="alert" className="ml-2 text-[11px] text-erro">
          {estado.erro}
        </span>
      ) : null}
    </form>
  );
}
