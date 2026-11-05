"use client";

import React, { useState } from "react";
import {
  Building2,
  Users,
  Clock,
  Sparkles,
  ShieldCheck,
  Sun,
  Moon,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";

export function PainelAjustesApple({
  usuarioEmail,
}: {
  usuarioEmail: string;
  configIA: {
    provedor_primario: string;
    modelo_primario: string;
  };
}) {
  const [tema, setTema] = useState<"escuro" | "claro">(() => {
    if (typeof window === "undefined") return "escuro";
    return document.documentElement.getAttribute("data-tema") === "claro"
      ? "claro"
      : "escuro";
  });

  function handleTrocarTema(novoTema: "escuro" | "claro") {
    setTema(novoTema);
    if (novoTema === "claro") {
      document.documentElement.setAttribute("data-tema", "claro");
      localStorage.setItem("vez_tema", "claro");
    } else {
      document.documentElement.removeAttribute("data-tema");
      localStorage.setItem("vez_tema", "escuro");
    }
  }

  return (
    <div className="space-y-6 select-none">
      {/* Grupo 1: Empresa & Operação CapitalCred */}
      <div className="space-y-2">
        <span className="px-1 text-[11px] font-semibold text-texto3 uppercase font-mono tracking-wider">
          Empresa & Operação
        </span>
        <div className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl divide-y divide-fio/40 overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-texto2">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Organização</p>
                <p className="text-[12px] text-texto3">CapitalCred Consultoria Financeira</p>
              </div>
            </div>
            <AppleBadge variant="success">Homologado</AppleBadge>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-texto2">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Consultor Responsável</p>
                <p className="text-[12px] text-texto3">{usuarioEmail}</p>
              </div>
            </div>
            <span className="text-[12px] font-mono text-texto2">Administrador</span>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-texto2">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Horário de Atendimento Comercial</p>
                <p className="text-[12px] text-texto3">08:00 às 20:00 (Segunda a Sexta)</p>
              </div>
            </div>
            <span className="text-[12px] text-jade font-medium">Configurado</span>
          </div>
        </div>
      </div>

      {/* Grupo 2: Automações & Segurança de Vendas */}
      <div className="space-y-2">
        <span className="px-1 text-[11px] font-semibold text-texto3 uppercase font-mono tracking-wider">
          Automações e Regras de Segurança
        </span>
        <div className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl divide-y divide-fio/40 overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-jade">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Barreiras Determinísticas Financeiras</p>
                <p className="text-[12px] text-texto3">
                  Números, taxas e valores nunca são inventados pela IA.
                </p>
              </div>
            </div>
            <AppleBadge variant="success" dot>Inviolável (Ativo)</AppleBadge>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-jade">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Aprovação Obrigatória de Follow-up</p>
                <p className="text-[12px] text-texto3">
                  Envios externos dependem estritamente da sua aprovação no painel.
                </p>
              </div>
            </div>
            <AppleBadge variant="success">SHA-256 Criptografado</AppleBadge>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sup2 text-texto2">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-texto">Limite de Cobranças por Lead</p>
                <p className="text-[12px] text-texto3">
                  Máximo de 3 tentativas para contatos que não responderem.
                </p>
              </div>
            </div>
            <span className="text-[12px] font-mono text-texto font-semibold">3 tentativas</span>
          </div>
        </div>
      </div>

      {/* Grupo 3: Aparência & Tema Apple */}
      <div className="space-y-2">
        <span className="px-1 text-[11px] font-semibold text-texto3 uppercase font-mono tracking-wider">
          Aparência do Painel
        </span>
        <div className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium text-texto">Esquema de Cores</p>
              <p className="text-[12px] text-texto3">
                Escolha a interface Dark Mode (OLED) ou Light Mode (macOS Sequoia)
              </p>
            </div>

            <div className="flex items-center gap-2 p-1 rounded-2xl bg-sup2 border border-fio">
              <button
                type="button"
                onClick={() => handleTrocarTema("escuro")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all cursor-pointer",
                  tema === "escuro"
                    ? "bg-sup text-texto shadow-sm border border-fio"
                    : "text-texto3 hover:text-texto"
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                Escuro
              </button>

              <button
                type="button"
                onClick={() => handleTrocarTema("claro")}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all cursor-pointer",
                  tema === "claro"
                    ? "bg-sup text-texto shadow-sm border border-fio"
                    : "text-texto3 hover:text-texto"
                )}
              >
                <Sun className="h-3.5 w-3.5" />
                Claro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
