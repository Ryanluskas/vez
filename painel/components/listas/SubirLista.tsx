"use client";

import { useActionState, useRef, useState } from "react";
import { subirLista } from "@/lib/acoes-listas";
import type { Resultado } from "@/lib/acoes-painel";

/*
  Subir a planilha. Importar 388 linhas leva alguns segundos, e sem um sinal
  de que está acontecendo o consultor clica de novo — e sobe a mesma lista
  duas vezes.
*/
export function SubirLista() {
  const [estado, enviar, carregando] = useActionState(subirLista, {} as Resultado);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={enviar}
      className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-5 sm:p-6 space-y-4 shadow-sm"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="rotulo mb-1.5 block">Planilha</span>
          <input
            type="file"
            name="arquivo"
            accept=".xlsx,.xls,.csv"
            required
            onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-[13px] text-texto2 file:mr-3 file:cursor-pointer file:rounded-xl file:border file:border-fio file:bg-sup2 file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-texto hover:file:border-fio-forte"
          />
        </label>

        <label className="flex-1 min-w-[160px]">
          <span className="rotulo mb-1.5 block">Nome da Lista (opcional)</span>
          <input
            type="text"
            name="nome"
            placeholder={arquivo?.replace(/\.[^.]+$/, "") ?? "Amapá Agosto"}
            className="h-10 w-full rounded-xl border border-fio bg-sup2 px-3.5 text-[14px] text-texto placeholder:text-texto3 focus:border-jade focus:bg-sup focus:outline-none focus:ring-2 focus:ring-jade/20 transition-all"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="h-10 rounded-xl bg-jade px-5 text-[13px] font-medium text-jade-texto shadow-sm transition-all hover:bg-jade-forte active:scale-[0.98] disabled:opacity-40 cursor-pointer shrink-0"
        >
          {carregando ? "Importando…" : "Importar Planilha"}
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-texto3">
        Precisa ter as colunas <code className="num text-texto2">DDD</code> e{" "}
        <code className="num text-texto2">Celular</code> — é por elas que o bot acha o cliente
        no WhatsApp. Linha sem telefone legível é pulada.
      </p>

      {/*
        A ação usa o mesmo campo pra erro e pra aviso ("importei 380, pulei 8").
        Cor diferente quando deu certo: aviso não é falha.
      */}
      {estado.erro ? (
        <p className={`mt-2 text-[12px] ${estado.ok ? "text-morno" : "text-brasa"}`}>
          {estado.erro}
        </p>
      ) : null}

      {estado.ok && !estado.erro ? (
        <p className="mt-2 text-[12px] text-jade">Lista importada.</p>
      ) : null}
    </form>
  );
}
