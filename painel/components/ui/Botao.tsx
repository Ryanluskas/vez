import { cn } from "@/lib/cn";

type Tom = "primario" | "secundario" | "fantasma" | "perigo";

const TONS: Record<Tom, string> = {
  // Uma acao primaria por tela. O jade solido e so dela.
  primario:
    "bg-jade text-jade-texto hover:bg-jade-forte border border-transparent font-medium",
  secundario:
    "bg-sup text-texto border border-fio hover:border-fio-forte hover:bg-sup2",
  fantasma:
    "bg-transparent text-texto2 border border-transparent hover:text-texto hover:bg-sup",
  perigo:
    "bg-transparent text-erro border border-fio hover:border-erro hover:bg-erro-fundo",
};

export function Botao({
  tom = "secundario",
  largo = false,
  className,
  ...resto
}: React.ComponentProps<"button"> & { tom?: Tom; largo?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[13px]",
        "transition-colors duration-100 disabled:opacity-45 disabled:pointer-events-none",
        TONS[tom],
        largo && "w-full",
        className
      )}
      {...resto}
    />
  );
}
