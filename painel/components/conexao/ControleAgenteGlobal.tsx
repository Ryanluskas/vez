"use client";

import React, { useState, useTransition } from "react";
import { Bot, Power, Zap, Clock, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { alternarAgenteGlobal } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

interface ControleAgenteGlobalProps {
  agenteAtivoInicial?: boolean;
  marcoAtivacaoInicial?: string | null;
  totalCampanhas?: number;
}

export function ControleAgenteGlobal({
  agenteAtivoInicial = true,
  marcoAtivacaoInicial,
  totalCampanhas = 0,
}: ControleAgenteGlobalProps) {
  const [ativo, setAtivo] = useState(agenteAtivoInicial);
  const [marco, setMarco] = useState(marcoAtivacaoInicial);
  const [isPending, startTransition] = useTransition();

  function handleAlternar() {
    const novoStatus = !ativo;
    setAtivo(novoStatus);
    const agoraIso = new Date().toISOString();
    setMarco(novoStatus ? agoraIso : null);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("acao", novoStatus ? "ativar" : "pausar");
      await alternarAgenteGlobal({ ok: true }, fd);
    });
  }

  return (
    <div className="rounded-2xl border border-fio bg-sup/70 backdrop-blur-xl p-6 transition-all space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "p-3 rounded-2xl border transition-colors shrink-0",
              ativo
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-sup2 border-fio text-texto3"
            )}
          >
            <Bot className="h-6 w-6" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-display text-[18px] font-bold text-texto tracking-tight">
                Agente Comercial Automático
              </h2>

              <AppleBadge variant={ativo ? "success" : "default"} dot>
                {ativo ? "Agente Ligado" : "Agente Pausado"}
              </AppleBadge>

              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Integração Botzapzap Ativa
              </span>
            </div>

            <p className="mt-1 text-[13px] text-texto2 leading-relaxed max-w-2xl">
              Quando ligado, o Vez recepciona automaticamente todos os contatos que responderem às
              campanhas do Botzapzap, aplicando as regras comerciais da CapitalCred e respeitando o
              marco temporal de ativação.
            </p>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
          <AppleButton
            size="md"
            variant={ativo ? "destructive" : "primary"}
            onClick={handleAlternar}
            disabled={isPending}
            icon={<Power className="h-4 w-4" />}
          >
            {isPending ? "Processando..." : ativo ? "Desligar Agente" : "Ligar Agente Vez"}
          </AppleButton>

          {ativo && marco && (
            <span className="text-[11px] font-mono text-texto3 flex items-center gap-1">
              <Clock className="h-3 w-3 text-jade" />
              Ativo desde {new Date(marco).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Grid de 3 Pilares Independentes de Governança */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-fio/60 text-[12px]">
        <div className="p-3 rounded-xl bg-sup2/50 border border-fio flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-jade shrink-0" />
          <div>
            <span className="font-medium text-texto block">Marco Temporal Estrito</span>
            <span className="text-[11px] text-texto3">Não responde retroativo</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-sup2/50 border border-fio flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-jade shrink-0" />
          <div>
            <span className="font-medium text-texto block">Regra de Ouro Ativa</span>
            <span className="text-[11px] text-texto3">Proibido inventar taxas</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-sup2/50 border border-fio flex items-center gap-2.5">
          <Zap className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <span className="font-medium text-texto block">Pós-Campanha Botzapzap</span>
            <span className="text-[11px] text-texto3">Atendimento imediato</span>
          </div>
        </div>
      </div>
    </div>
  );
}
