import React from "react";
import { cn } from "@/lib/cn";
import { Inbox } from "lucide-react";

/* Cabecalho de tela no estilo Apple / macOS Sequoia:
   rotulo de secao em mono uppercase, titulo em display bold, subtitulo em slate e acao a direita. */
export function CabecalhoDeTela({
  titulo,
  linha,
  rotulo,
  acao,
}: {
  titulo: string;
  linha: string;
  rotulo?: string;
  acao?: React.ReactNode;
}) {
  return (
    <header className="mb-6 space-y-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {rotulo ? (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-jade font-semibold">
                {rotulo}
              </span>
              <span className="h-1 w-1 rounded-full bg-texto3" />
              <span className="text-[11px] text-texto3">CapitalCred</span>
            </div>
          ) : null}
          <h1 className="font-display text-[26px] sm:text-[30px] font-bold tracking-tight text-texto">
            {titulo}
          </h1>
          <p className="mt-1 text-[13px] sm:text-[14px] text-texto2 max-w-2xl leading-relaxed">
            {linha}
          </p>
        </div>
        {acao ? <div className="shrink-0">{acao}</div> : null}
      </div>
    </header>
  );
}

/* Container de tela com largura generosa e padding seguro. */
export function Tela({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8 space-y-6 select-none",
        className
      )}
    >
      {children}
    </div>
  );
}

/* Estado vazio com profundidade Apple: convite claro, icone contextual e acao primária. */
export function Vazio({
  titulo,
  corpo,
  acao,
  icone: Icone = Inbox,
}: {
  titulo: string;
  corpo: string;
  acao?: React.ReactNode;
  icone?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-fio bg-sup/40 backdrop-blur-md px-6 py-12 text-center space-y-3">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sup2 border border-fio text-texto2">
        <Icone className="h-6 w-6 stroke-[1.5]" />
      </div>
      <p className="font-display text-[16px] font-semibold tracking-tight text-texto">
        {titulo}
      </p>
      <p className="mx-auto max-w-md text-[13px] leading-relaxed text-texto2">
        {corpo}
      </p>
      {acao ? <div className="mt-4 flex justify-center">{acao}</div> : null}
    </div>
  );
}
