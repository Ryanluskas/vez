"use client";

import { useActionState, useRef, useEffect } from "react";
import {
  criarConhecimento,
  apagarConhecimento,
  criarConhecimentoSugerido,
  type Resultado,
} from "@/lib/acoes-painel";
import type { Conhecimento as Fato } from "@/lib/tipos";
import { cn } from "@/lib/cn";

/*
  O que o bot sabe sobre a operação. É o contexto fixo que entra em todo
  prompt — por isso vale a pena ser curto e verdadeiro, e por isso número
  de dinheiro é recusado na hora de salvar.
*/
export function Conhecimento({ fatos }: { fatos: Fato[] }) {
  const [novo, criar, criando] = useActionState(criarConhecimento, {} as Resultado);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (novo.ok) form.current?.reset();
  }, [novo.ok]);

  return (
    <section className="mt-10 border-t border-fio pt-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
          O que o bot sabe
        </h2>
        {fatos.length > 0 ? <span className="rotulo">{fatos.length} fatos</span> : null}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
        Fatos sobre a sua operação: que empresa é, com que bancos trabalha, como
        funciona a redução de taxa, que documentos pedir. Sem isso ele responde como
        atendente genérico de banco.
      </p>

      {fatos.length === 0 ? <Sugeridos /> : null}

      {fatos.length > 0 ? (
        <div className="mt-4 border-b border-fio">
          {fatos.map((f) => (
            <Linha key={f.id} fato={f} />
          ))}
        </div>
      ) : null}

      <form action={criar} ref={form} className="mt-4">
        <input
          name="assunto"
          required
          maxLength={60}
          autoComplete="off"
          placeholder="Assunto — ex: Convênios que atendemos"
          disabled={criando}
          aria-label="Assunto do fato"
          className={cn(
            "h-9 w-full rounded-md border border-fio bg-sup px-3 text-[13px] text-texto",
            "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none"
          )}
        />
        <textarea
          name="conteudo"
          required
          maxLength={1200}
          rows={3}
          placeholder="O que o bot precisa saber sobre isso. Sem valor, taxa ou parcela — esses mudam por cliente."
          disabled={criando}
          aria-label="Conteúdo do fato"
          className={cn(
            "mt-2 w-full resize-y rounded-md border border-fio bg-sup px-3 py-2.5 text-[13px] leading-relaxed text-texto",
            "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none"
          )}
        />
        <button
          type="submit"
          disabled={criando}
          className={cn(
            "mt-2 h-9 rounded-md border border-fio bg-sup px-3.5 text-[13px] text-texto",
            "transition-colors hover:border-fio-forte hover:bg-sup2 disabled:opacity-45"
          )}
        >
          {criando ? "Salvando…" : "Adicionar fato"}
        </button>
        {novo.erro ? (
          <p role="alert" className="mt-2 text-[12px] leading-relaxed text-erro">
            {novo.erro}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function Linha({ fato }: { fato: Fato }) {
  const [estado, apagar, apagando] = useActionState(
    apagarConhecimento,
    {} as Resultado
  );

  if (estado.ok) return null;

  return (
    <div className="flex items-start justify-between gap-4 border-t border-fio py-3.5">
      <div className="min-w-0">
        <span className="text-[13px] text-texto">{fato.assunto}</span>
        <p className="mt-1 text-[13px] leading-relaxed text-texto2">{fato.conteudo}</p>
      </div>
      <form action={apagar} className="shrink-0">
        <input type="hidden" name="id" value={fato.id} />
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
    async () => criarConhecimentoSugerido(),
    {} as Resultado
  );

  return (
    <form
      action={criar}
      className="mt-4 rounded-lg border border-dashed border-fio px-5 py-6 text-center"
    >
      <p className="mx-auto max-w-md text-[13px] leading-relaxed text-texto2">
        Montei oito fatos a partir das suas conversas reais: quem é a Capital Cred,
        para quem vocês trabalham, como funciona a redução de taxa, o alongamento de
        prazo, os documentos e os prazos. Confira e ajuste o que estiver errado.
      </p>
      <button
        type="submit"
        disabled={criando}
        className={cn(
          "mt-4 h-9 rounded-md bg-jade px-3.5 text-[13px] font-medium text-jade-texto",
          "transition-colors hover:bg-jade-forte disabled:opacity-45"
        )}
      >
        {criando ? "Criando…" : "Criar os oito"}
      </button>
      {estado.erro ? (
        <p role="alert" className="mt-2 text-[12px] text-erro">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
