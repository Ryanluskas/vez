"use client";

import { useActionState } from "react";
import { alternarAtendimento, type Resultado } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  Um clique separa cliente de não-cliente. Fica discreto até o mouse passar:
  é uma ação que o consultor usa uma vez por contato e nunca mais, então não
  merece competir por atenção com a conversa em si.
*/
export function BotaoAtender({
  id,
  atendendo,
  nome,
}: {
  id: string;
  atendendo: boolean;
  nome: string;
}) {
  const [estado, alternar, salvando] = useActionState(
    alternarAtendimento,
    {} as Resultado
  );

  return (
    <form action={alternar} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="atender" value={atendendo ? "false" : "true"} />
      <button
        type="submit"
        disabled={salvando}
        title={
          atendendo
            ? `O bot para de atender ${nome}. As mensagens continuam sendo gravadas.`
            : `O bot volta a atender ${nome}.`
        }
        className={cn(
          "rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors disabled:opacity-45",
          atendendo
            ? "text-texto3 hover:bg-sup hover:text-texto"
            : "text-jade hover:bg-sup"
        )}
      >
        {salvando ? "…" : atendendo ? "Não atender" : "Voltar a atender"}
      </button>
      {estado.erro ? (
        <span role="alert" className="ml-2 text-[11px] text-erro">
          {estado.erro}
        </span>
      ) : null}
    </form>
  );
}
