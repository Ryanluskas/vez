"use client";

import Link from "next/link";
import { Marca, Wordmark } from "@/components/marca/Wordmark";
import { Sun, Moon, ArrowRight } from "lucide-react";
import { useState } from "react";

export function BarraDeEstado({
  abertas,
  motorLigado,
}: {
  abertas: number;
  motorLigado: boolean;
}) {
  const [tema, setTema] = useState<"escuro" | "claro">(() => {
    if (typeof window === "undefined") return "claro";
    return document.documentElement.getAttribute("data-tema") === "escuro"
      ? "escuro"
      : "claro";
  });

  function alternarTema() {
    const proximo = tema === "claro" ? "escuro" : "claro";
    setTema(proximo);
    if (proximo === "escuro") {
      document.documentElement.setAttribute("data-tema", "escuro");
      localStorage.setItem("vez:tema", "escuro");
    } else {
      document.documentElement.removeAttribute("data-tema");
      localStorage.setItem("vez:tema", "claro");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-fio bg-sup px-4 sm:px-6 select-none">
      <div className="flex items-center gap-3">
        <Link
          href="/visao-geral"
          className="flex items-center gap-2 hover:opacity-85 transition-opacity"
        >
          <Marca tamanho={22} />
          <Wordmark tamanho={18} />
        </Link>
        <span className="text-[12px] text-texto3 hidden sm:inline">
          / CapitalCred
        </span>
      </div>

      <div className="flex items-center gap-4">
        {abertas > 0 && (
          <Link
            href="/fila"
            className="flex items-center gap-1.5 text-[12px] text-atencao font-medium hover:underline"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-atencao" />
            <span className="num font-semibold">{abertas}</span>
            <span>na fila</span>
          </Link>
        )}

        {/* Alternador de Tema Sóbrio */}
        <button
          type="button"
          onClick={alternarTema}
          aria-label="Alternar tema claro e escuro"
          className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] border border-fio hover:bg-sup2 text-[12px] text-texto2 hover:text-texto transition-colors cursor-pointer"
        >
          {tema === "claro" ? (
            <>
              <Moon className="h-3 w-3" />
              <span className="hidden sm:inline">Escuro</span>
            </>
          ) : (
            <>
              <Sun className="h-3 w-3" />
              <span className="hidden sm:inline">Claro</span>
            </>
          )}
        </button>

        {/* Status WhatsApp — Fonte Única de Verdade */}
        {motorLigado ? (
          <Link
            href="/conexao"
            title="Conexão com WhatsApp ativa"
            className="flex items-center gap-1.5 text-[12px] text-texto2 hover:text-texto"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-jade" />
            <span className="hidden sm:inline">WhatsApp Conectado</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12px] text-erro font-medium">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-erro" />
              <span className="hidden sm:inline">WhatsApp Offline</span>
            </span>
            <Link
              href="/conexao"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-erro text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
            >
              Reconectar
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
