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
      className="rounded-lg border border-dashed border-fio bg-sup p-5"
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
            className="block w-full text-[12px] text-texto2 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-fio file:bg-fundo file:px-3 file:py-1.5 file:text-[12px] file:text-texto hover:file:border-fio-forte"
          />
        </label>

        <label className="flex-1 min-w-[160px]">
          <span className="rotulo mb-1.5 block">Nome (opcional)</span>
          <input
            type="text"
            name="nome"
            placeholder={arquivo?.replace(/\.[^.]+$/, "") ?? "Amapá agosto"}
            className="h-8 w-full rounded-md border border-fio bg-fundo px-2.5 text-[13px] text-texto placeholder:text-texto3 focus:border-jade focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="h-8 rounded-md bg-jade px-4 text-[13px] text-fundo transition-colors hover:bg-jade-forte disabled:opacity-50"
        >
          {carregando ? "Importando…" : "Subir"}
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
