import Link from "next/link";
import { Marca, Wordmark } from "@/components/marca/Wordmark";
import { cn } from "@/lib/cn";

/*
  Barra de estado. O motor roda na maquina do consultor, entao o painel
  precisa ser honesto o tempo todo sobre se ele esta de pe — se estiver
  desligado, nada acontece e o consultor tem que saber na hora.
*/
export function BarraDeEstado({
  abertas,
  motorLigado,
}: {
  abertas: number;
  motorLigado: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-fio bg-fundo px-4 sm:px-5">
      <Link href="/fila" className="flex items-center gap-2.5 rounded-md">
        <Marca tamanho={22} />
        <Wordmark tamanho={19} />
      </Link>

      <div className="flex items-center gap-4">
        {abertas > 0 ? (
          <span className="text-[12px] text-texto2">
            <span className="num text-texto">{abertas}</span> esperando
          </span>
        ) : null}

        <Link
          href="/conexao"
          className="flex items-center gap-2 rounded-md text-[12px] text-texto2 transition-colors hover:text-texto"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              motorLigado ? "bg-jade" : "bg-texto3"
            )}
          />
          {motorLigado ? "Motor ligado" : "Motor desligado"}
        </Link>
      </div>
    </header>
  );
}
