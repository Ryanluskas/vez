import { cn } from "@/lib/cn";

type Tom = "primario" | "secundario" | "fantasma" | "perigo";

const TONS: Record<Tom, string> = {
  primario:
    "bg-jade text-jade-texto hover:bg-jade-forte border border-transparent font-medium shadow-sm",
  secundario:
    "bg-sup2 text-texto border border-fio hover:border-fio-forte hover:bg-sup",
  fantasma:
    "bg-transparent text-texto2 border border-transparent hover:text-texto hover:bg-sup",
  perigo:
    "bg-erro-fundo text-erro border border-erro/20 hover:border-erro hover:bg-erro hover:text-white",
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-sans tracking-tight cursor-pointer",
        "transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none select-none",
        TONS[tom],
        largo && "w-full",
        className
      )}
      {...resto}
    />
  );
}
