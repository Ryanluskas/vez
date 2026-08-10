"use client";

import { useActionState, useRef } from "react";
import {
  mudarEtapa,
  alternarSeguimento,
  alternarAtendimento,
  type Resultado,
} from "@/lib/acoes-painel";
import { ETAPAS, ROTULO_DA_ETAPA, type Etapa } from "@/lib/tipos";
import { cn } from "@/lib/cn";

/*
  Os três controles de uma conversa, na ordem em que importam:
  onde ela está no funil, se o bot cobra quando ela esfria, e se é cliente.
*/
export function ControlesDaConversa({
  id,
  nome,
  etapa,
  seguir,
  atendendo,
  followups,
}: {
  id: string;
  nome: string;
  etapa: Etapa;
  seguir: boolean;
  atendendo: boolean;
  followups: number;
}) {
  const [, salvarEtapa] = useActionState(mudarEtapa, {} as Resultado);
  const [, salvarSeguir] = useActionState(alternarSeguimento, {} as Resultado);
  const [, salvarAtender] = useActionState(alternarAtendimento, {} as Resultado);
  const formEtapa = useRef<HTMLFormElement>(null);

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {atendendo ? (
        <form action={salvarEtapa} ref={formEtapa}>
          <input type="hidden" name="id" value={id} />
          <select
            name="etapa"
            defaultValue={etapa}
            aria-label={`Etapa de ${nome}`}
            onChange={() => formEtapa.current?.requestSubmit()}
            className={cn(
              "h-7 rounded-md border border-fio bg-sup px-2 text-[12px] text-texto",
              "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none",
              etapa === "documentos_recebidos" && "border-jade text-jade"
            )}
          >
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ROTULO_DA_ETAPA[e]}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      {atendendo ? (
        <form action={salvarSeguir}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="seguir" value={seguir ? "false" : "true"} />
          <button
            type="submit"
            title={
              seguir
                ? `O bot para de cobrar ${nome} quando a conversa esfriar.`
                : `O bot volta a cobrar ${nome}.`
            }
            className={cn(
              "rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors",
              seguir ? "text-texto3 hover:text-texto" : "text-morno hover:text-texto"
            )}
          >
            {seguir
              ? followups > 0
                ? `cobrado ${followups}×`
                : "cobrando"
              : "não cobrar"}
          </button>
        </form>
      ) : null}

      <form action={salvarAtender}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="atender" value={atendendo ? "false" : "true"} />
        <button
          type="submit"
          title={
            atendendo
              ? `O bot para de atender ${nome}. As mensagens continuam sendo gravadas.`
              : `O bot volta a atender ${nome}.`
          }
          className={cn(
            "rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors",
            atendendo ? "text-texto3 hover:bg-sup hover:text-texto" : "text-jade hover:bg-sup"
          )}
        >
          {atendendo ? "Não atender" : "Voltar a atender"}
        </button>
      </form>
    </div>
  );
}
