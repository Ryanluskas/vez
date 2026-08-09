"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Tema = "escuro" | "claro";

export function TrocaDeTema() {
  const [tema, setTema] = useState<Tema>("escuro");

  useEffect(() => {
    setTema(
      document.documentElement.getAttribute("data-tema") === "claro"
        ? "claro"
        : "escuro"
    );
  }, []);

  function aplicar(novo: Tema) {
    if (novo === "claro") document.documentElement.setAttribute("data-tema", "claro");
    else document.documentElement.removeAttribute("data-tema");
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
