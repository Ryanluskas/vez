import { cn } from "@/lib/cn";

/* Cabecalho de tela: titulo em display, uma linha dizendo o que a tela faz,
   e um rotulo mono a direita quando a ordem/regra da tela precisa ser dita. */
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
    <header className="mb-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.035em]">
          {titulo}
        </h1>
        {rotulo ? <span className="rotulo hidden sm:block">{rotulo}</span> : null}
        {acao}
      </div>
      <p className="mt-2 text-[13px] text-texto2">{linha}</p>
    </header>
  );
}

export function Tela({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-3xl px-5 py-7 sm:px-8 sm:py-9", className)}>
      {children}
    </div>
  );
}

/* Estado vazio: convite, nao lamento. Sempre diz qual e o proximo passo. */
export function Vazio({
  titulo,
  corpo,
  acao,
}: {
  titulo: string;
  corpo: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-fio px-6 py-12 text-center">
      <p className="font-display text-[17px] font-semibold tracking-[-0.02em] text-texto">
        {titulo}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-texto2">{corpo}</p>
      {acao ? <div className="mt-5 flex justify-center">{acao}</div> : null}
    </div>
  );
}
