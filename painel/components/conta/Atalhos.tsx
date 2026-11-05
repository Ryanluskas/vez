"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  criarAtalho,
  apagarAtalho,
  criarAtalhosSugeridos,
  type Resultado,
} from "@/lib/acoes-painel";
import type { Atalho } from "@/lib/tipos";
import { cn } from "@/lib/cn";

/*
  Gerenciar as respostas curinga. Vive aqui em "Meu jeito" porque é a mesma
  ideia das outras coisas desta tela: são as SUAS palavras, não as da IA.
*/
export function Atalhos({ atalhos }: { atalhos: Atalho[] }) {
  const [novo, criar, criando] = useActionState(criarAtalho, {} as Resultado);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (novo.ok) form.current?.reset();
  }, [novo.ok]);

  return (
    <section className="mt-10 border-t border-fio pt-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
          Respostas curinga
        </h2>
        {atalhos.length > 0 ? (
          <span className="rotulo">{atalhos.length} atalhos</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
        Aparecem como botões na Fila. Clicar preenche a caixa de resposta — não
        envia nada, você ainda confere e aprova.
      </p>

      {atalhos.length === 0 ? <Sugeridos /> : null}

      {atalhos.length > 0 ? (
        <div className="mt-4 border-b border-fio">
          {atalhos.map((a) => (
            <Linha key={a.id} atalho={a} />
          ))}
        </div>
      ) : null}

      <form action={criar} ref={form} className="mt-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="titulo"
            required
            maxLength={30}
            autoComplete="off"
            placeholder="Nome do botão"
            disabled={criando}
            aria-label="Nome do atalho"
            className={cn(
              "h-10 w-full rounded-xl border border-fio bg-sup2 px-3.5 text-[14px] text-texto sm:w-48 placeholder:text-texto3",
              "transition-colors hover:border-fio-forte focus:border-jade focus:bg-sup focus:outline-none focus:ring-2 focus:ring-jade/20"
            )}
          />
          <input
            name="texto"
            required
            maxLength={500}
            autoComplete="off"
            placeholder="O que ele escreve na caixa de resposta"
            disabled={criando}
            aria-label="Texto do atalho"
            className={cn(
              "h-10 min-w-0 flex-1 rounded-xl border border-fio bg-sup2 px-3.5 text-[14px] text-texto placeholder:text-texto3",
              "transition-colors hover:border-fio-forte focus:border-jade focus:bg-sup focus:outline-none focus:ring-2 focus:ring-jade/20"
            )}
          />
          <button
            type="submit"
            disabled={criando}
            className={cn(
              "h-10 shrink-0 rounded-xl bg-jade px-4 text-[13px] font-medium text-jade-texto shadow-sm cursor-pointer",
              "transition-all duration-150 hover:bg-jade-forte active:scale-[0.98] disabled:opacity-40"
            )}
          >
            {criando ? "Salvando…" : "Adicionar Atalho"}
          </button>
        </div>
        {novo.erro ? (
          <p role="alert" className="mt-2 text-[12px] text-erro">
            {novo.erro}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function Linha({ atalho }: { atalho: Atalho }) {
  const [estado, apagar, apagando] = useActionState(apagarAtalho, {} as Resultado);

  if (estado.ok) return null;

  return (
    <div className="flex items-start justify-between gap-4 border-t border-fio py-3">
      <div className="min-w-0">
        <span className="text-[13px] text-texto">{atalho.titulo}</span>
        <p className="mt-0.5 text-[13px] leading-relaxed text-texto2">{atalho.texto}</p>
      </div>
      <form action={apagar} className="shrink-0">
        <input type="hidden" name="id" value={atalho.id} />
        <button
          type="submit"
          disabled={apagando}
          className="rounded-md text-[11px] text-texto3 transition-colors hover:text-erro disabled:opacity-45"
        >
          {apagando ? "…" : "Apagar"}
        </button>
      </form>
    </div>
  );
}

function Sugeridos() {
  const [estado, criar, criando] = useActionState(
    async () => criarAtalhosSugeridos(),
    {} as Resultado
  );

  return (
    <form action={criar} className="mt-4 rounded-lg border border-dashed border-fio px-5 py-6 text-center">
      <p className="text-[13px] text-texto2">
        Nenhum atalho ainda. Posso criar seis que servem pra quase todo dia —
        &quot;vou verificar&quot;, &quot;sem margem&quot;, &quot;banco negou&quot; — e
        você ajusta depois.
      </p>
      <button
        type="submit"
        disabled={criando}
        className={cn(
          "mt-4 h-9 rounded-md bg-jade px-3.5 text-[13px] font-medium text-jade-texto",
          "transition-colors hover:bg-jade-forte disabled:opacity-45"
        )}
      >
        {criando ? "Criando…" : "Criar os seis"}
      </button>
      {estado.erro ? (
        <p role="alert" className="mt-2 text-[12px] text-erro">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
