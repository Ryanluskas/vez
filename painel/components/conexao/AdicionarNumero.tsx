"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarConexao, type Resultado } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  Cadastrar aqui não conecta nada sozinho: cria a linha, o motor vê em até
  30 segundos, abre um WhatsApp novo e o QR aparece no cartão.
*/
export function AdicionarNumero({ quantos }: { quantos: number }) {
  const [estado, criar, criando] = useActionState(criarConexao, {} as Resultado);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado.ok]);

  return (
    <form action={criar} ref={form} className="mt-6 border-t border-fio pt-5">
      <span className="rotulo">Adicionar número</span>

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          name="apelido"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="Comercial"
          disabled={criando}
          aria-label="Apelido do número"
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md border border-fio bg-sup px-3 text-[13px] text-texto",
            "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none"
          )}
        />
        <button
          type="submit"
          disabled={criando}
          className={cn(
            "h-9 shrink-0 rounded-md border border-fio bg-sup px-3.5 text-[13px] text-texto",
            "transition-colors hover:border-fio-forte hover:bg-sup2 disabled:opacity-45"
          )}
        >
          {criando ? "Criando…" : "Adicionar"}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-texto3">
        O apelido é só pra você se achar — &quot;Comercial&quot;, &quot;Antigo&quot;,
        &quot;INSS&quot;. Depois de criar, o QR aparece aqui.
        {quantos >= 3 ? (
          <>
            {" "}
            <span className="text-morno">
              Cada número usa ~350 MB de memória. Com {quantos} ativos, fique de olho se
              a máquina começar a travar.
            </span>
          </>
        ) : null}
      </p>

      {estado.erro ? (
        <p role="alert" className="mt-2 text-[12px] text-erro">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
