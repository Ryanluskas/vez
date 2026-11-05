import { cn } from "@/lib/cn";

export function Campo({
  rotulo,
  dica,
  className,
  id,
  ...resto
}: React.ComponentProps<"input"> & { rotulo: string; dica?: string }) {
  const idCampo = id ?? resto.name;

  return (
    <label className="block space-y-1.5" htmlFor={idCampo}>
      <span className="block text-[13px] font-medium text-texto2">{rotulo}</span>
      <input
        id={idCampo}
        className={cn(
          "h-10 w-full rounded-xl border border-fio bg-sup2 px-3.5 text-[14px] text-texto placeholder:text-texto3",
          "transition-all duration-150 hover:border-fio-forte",
          "focus:border-jade focus:bg-sup focus:outline-none focus:ring-2 focus:ring-jade/20",
          className
        )}
        {...resto}
      />
      {dica ? <span className="block text-[12px] text-texto3">{dica}</span> : null}
    </label>
  );
}
