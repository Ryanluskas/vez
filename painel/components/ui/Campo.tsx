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
    <label className="block" htmlFor={idCampo}>
      <span className="mb-1.5 block text-[13px] text-texto2">{rotulo}</span>
      <input
        id={idCampo}
        className={cn(
          "h-10 w-full rounded-md border border-fio bg-sup px-3 text-[14px] text-texto",
          "transition-colors duration-100 hover:border-fio-forte",
          "focus:border-jade focus:outline-none focus-visible:outline-none",
          className
        )}
        {...resto}
      />
      {dica ? <span className="mt-1.5 block text-[12px] text-texto3">{dica}</span> : null}
    </label>
  );
}
