import { cn } from "@/lib/cn";

/* Erro e confirmacao usam a mesma caixa. Sem icone, sem "ops", sem desculpa. */
export function Aviso({
  tom = "erro",
  children,
}: {
  tom?: "erro" | "certo";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tom === "erro" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2.5 text-[13px] leading-relaxed",
        tom === "erro"
          ? "border-erro/40 bg-erro-fundo text-erro"
          : "border-jade/40 bg-jade-fundo text-jade"
      )}
    >
      {children}
    </p>
  );
}
