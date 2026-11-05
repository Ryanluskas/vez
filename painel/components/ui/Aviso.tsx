import { cn } from "@/lib/cn";

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
        "rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm font-medium",
        tom === "erro"
          ? "border-erro/30 bg-erro-fundo text-erro"
          : "border-jade/30 bg-jade-fundo text-jade"
      )}
    >
      {children}
    </p>
  );
}
