"use client";

import { useActionState, useState } from "react";
import { salvarModoAutonomo, type Resultado } from "@/lib/acoes-painel";
/*
  Os dados vêm de um módulo próprio, não do arquivo de ações: um arquivo
  "use server" só pode exportar funções async, e um array ali derruba a
  página em runtime mesmo com o build passando.
*/
import { CATEGORIAS_LIBERAVEIS, MODOS } from "@/lib/modos";
import { cn } from "@/lib/cn";

/*
  O interruptor que transforma o produto: com ele ligado, o bot fecha com o
  cliente enquanto o consultor faz outra coisa.

  O que torna isso seguro não é a aprovação que ele substitui — é a regra de
  ouro. Pergunta de valor nunca vira rascunho, então nunca chega perto de
  sair sozinha. Por isso "valor" nem aparece na lista abaixo.
*/
export function ModoAutonomo({
  modoInicial,
  categoriasIniciais,
}: {
  modoInicial: string;
  categoriasIniciais: string[];
}) {
  const [estado, salvar, salvando] = useActionState(
    salvarModoAutonomo,
    {} as Resultado
  );
  const [modo, setModo] = useState(modoInicial);
  const ligado = modo !== "manual";

  return (
    <form action={salvar} className="mt-10 border-t border-fio pt-7">
      <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
        Como o bot trabalha
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
        O que envolve valor, parcela, saldo ou taxa vai para a Fila em qualquer modo.
        Isso não muda e não tem como desligar.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {MODOS.map((m) => (
          <label key={m.chave} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="modo"
              value={m.chave}
              checked={modo === m.chave}
              onChange={() => setModo(m.chave)}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-jade"
            />
            <span className="min-w-0">
              <span
                className={cn(
                  "text-[14px]",
                  modo === m.chave ? "text-texto" : "text-texto2"
                )}
              >
                {m.nome}
              </span>
              <span className="block text-[12px] leading-relaxed text-texto3">
                {m.resumo}
              </span>
            </span>
          </label>
        ))}
      </div>

      <fieldset
        disabled={!ligado}
        className={cn("mt-5 transition-opacity", !ligado && "opacity-40")}
      >
        <legend className="rotulo">Pode responder sozinho sobre</legend>
        <div className="mt-3 flex flex-col gap-2.5">
          {CATEGORIAS_LIBERAVEIS.map((c) => (
            <label key={c.chave} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                name="categoria"
                value={c.chave}
                defaultChecked={categoriasIniciais.includes(c.chave)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-jade"
              />
              <span className="min-w-0">
                <span className="text-[13px] text-texto">{c.nome}</span>
                <span className="ml-2 text-[12px] text-texto3">{c.exemplo}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className={cn(
            "h-9 rounded-md bg-jade px-3.5 text-[13px] font-medium text-jade-texto",
            "transition-colors hover:bg-jade-forte disabled:opacity-45"
          )}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {estado.ok ? (
          <span role="status" className="text-[12px] text-jade">
            Salvo. O motor pega em até 5 minutos.
          </span>
        ) : null}
        {estado.erro ? (
          <span role="alert" className="text-[12px] text-erro">
            {estado.erro}
          </span>
        ) : null}
      </div>

      {ligado ? (
        <p className="mt-4 border-l-2 border-morno pl-3 text-[12px] leading-relaxed text-texto2">
          O que sair sozinho aparece em Conversas como qualquer outra mensagem, mas
          não vira exemplo em &quot;Meu jeito&quot; — o bot só aprende com o que você
          leu e aprovou.
        </p>
      ) : null}
    </form>
  );
}
