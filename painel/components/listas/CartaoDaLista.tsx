"use client";

import { useActionState } from "react";
import { alternarLista, apagarLista } from "@/lib/acoes-listas";
import type { Resultado } from "@/lib/acoes-painel";
import type { Lista } from "@/lib/campos-da-lista";
import { cn } from "@/lib/cn";

/*
  Uma lista. Duas ações: desligar (a de março pode voltar a valer em abril) e
  apagar de vez.

  Desligar existe porque apagar é definitivo e a planilha nem sempre está
  guardada em outro lugar.
*/
export function CartaoDaLista({ lista }: { lista: Lista }) {
  const [, alternar] = useActionState(alternarLista, {} as Resultado);
  const [, apagar] = useActionState(apagarLista, {} as Resultado);

  return (
    <article className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm hover:border-fio-forte transition-all">
      <div className={cn("min-w-0 flex-1", !lista.ativa && "opacity-50")}>
        <div className="flex flex-wrap items-center gap-x-3">
          <span className="text-[14px] text-texto">{lista.nome}</span>
          <span className="num text-[12px] text-texto3">
            {lista.linhas.toLocaleString("pt-BR")} clientes
          </span>
          {!lista.ativa ? (
            <span className="text-[11px] text-texto3">desligada</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] text-texto3">
          {lista.arquivo ?? "—"} ·{" "}
          {new Date(lista.criado_em).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <form action={alternar}>
          <input type="hidden" name="id" value={lista.id} />
          <input type="hidden" name="ativa" value={lista.ativa ? "false" : "true"} />
          <button
            type="submit"
            title={
              lista.ativa
                ? "O bot para de usar os valores desta lista."
                : "O bot volta a usar os valores desta lista."
            }
            className={cn(
              "rounded-md px-2 py-1 text-[11px] whitespace-nowrap transition-colors",
              lista.ativa ? "text-texto3 hover:bg-sup hover:text-texto" : "text-jade hover:bg-sup"
            )}
          >
            {lista.ativa ? "Desligar" : "Ligar"}
          </button>
        </form>

        <form action={apagar}>
          <input type="hidden" name="id" value={lista.id} />
          <button
            type="submit"
            title={`Apaga a lista "${lista.nome}" e os ${lista.linhas} clientes dela. Não dá pra desfazer.`}
            className="rounded-md px-2 py-1 text-[11px] whitespace-nowrap text-texto3 transition-colors hover:bg-sup hover:text-brasa"
          >
            Apagar
          </button>
        </form>
      </div>
    </article>
  );
}
