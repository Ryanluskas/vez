"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Tema = "escuro" | "claro";

export function TrocaDeTema() {
  const [tema, setTema] = useState<Tema>("escuro");

  useEffect(() => {
    /*
      Le do localStorage, nao do atributo do <html>: em desenvolvimento o
      Strict Mode remonta uma vez e, nessa remontagem, o React reseta os
      atributos do <html> que nao vem do JSX — apagando justamente o que o
      script anti-flash tinha posto. Quem manda e o localStorage.
    */
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem("vez:tema");
    } catch {
      // Navegador sem storage: fica no padrão escuro.
    }

    const atual: Tema = salvo === "claro" ? "claro" : "escuro";
    document.documentElement.setAttribute("data-tema", atual);
    setTema(atual);
  }, []);

  function aplicar(novo: Tema) {
    document.documentElement.setAttribute("data-tema", novo);
    try {
      localStorage.setItem("vez:tema", novo);
    } catch {
      // Navegador sem storage: o tema vale só nesta aba.
    }
    setTema(novo);
  }

  return (
    <div
      role="group"
      aria-label="Tema"
      className="inline-flex rounded-md border border-fio p-0.5"
    >
      {(["escuro", "claro"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => aplicar(t)}
          aria-pressed={tema === t}
          className={cn(
            "rounded-[5px] px-3 py-1 text-[12px] capitalize transition-colors",
            tema === t ? "bg-sup2 text-texto" : "text-texto2 hover:text-texto"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
