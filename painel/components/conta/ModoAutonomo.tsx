"use client";

import { useActionState, useState } from "react";
import {
  salvarModoAutonomo,
  CATEGORIAS_LIBERAVEIS,
  type Resultado,
} from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  O interruptor que transforma o produto: com ele ligado, o bot fecha com o
  cliente enquanto o consultor faz outra coisa.

  O que torna isso seguro não é a aprovação que ele substitui — é a regra de
  ouro. Pergunta de valor nunca vira rascunho, então nunca chega perto de
  sair sozinha. Por isso "valor" nem aparece na lista abaixo.
*/
export function ModoAutonomo({
  ligadoInicial,
  categoriasIniciais,
}: {
  ligadoInicial: boolean;
  categoriasIniciais: string[];
}) {
  const [estado, salvar, salvando] = useActionState(
    salvarModoAutonomo,
    {} as Resultado
  );
  const [ligado, setLigado] = useState(ligadoInicial);

  return (
    <form action={salvar} className="mt-10 border-t border-fio pt-7">
      <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
        Modo autônomo
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
        Com isto ligado, o bot responde sozinho os assuntos que você marcar — sem
        esperar sua aprovação. O que envolve valor, parcela, saldo ou taxa continua
        indo para a Fila, sempre. Isso não muda e não tem como desligar.
      </p>

      <label className="mt-4 flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="ligado"
          checked={ligado}
          onChange={(e) => setLigado(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            ligado ? "bg-jade" : "bg-sup2",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-jade peer-focus-visible:outline-offset-2"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-texto transition-[left]",
              ligado ? "left-[18px]" : "left-0.5"
            )}
          />
        </span>
        <span className="text-[14px] text-texto">
          {ligado ? "Respondendo sozinho" : "Tudo espera sua aprovação"}
        </span>
      </label>

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
