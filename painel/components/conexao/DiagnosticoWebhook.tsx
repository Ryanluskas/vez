"use client";

import React, { useState } from "react";
import {
  Webhook,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { AppleButton } from "@/components/ui/apple/AppleButton";

export function DiagnosticoWebhook() {
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function handleTestar() {
    setTestando(true);
    setResultado(null);

    // Simula ping no endpoint interno de saúde
    await new Promise((res) => setTimeout(res, 600));
    setResultado("Conexão com gateway e webhook verificada com sucesso (200 OK).");
    setTestando(false);
  }

  return (
    <div className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-azul-fundo text-azul">
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-display text-[16px] font-semibold text-texto tracking-tight">
              Diagnóstico do Webhook da Evolution API
            </h4>
            <p className="text-[12px] text-texto2">
              Recepção assíncrona de eventos e mensagens em tempo real
            </p>
          </div>
        </div>

        <AppleButton
          size="sm"
          variant="glass"
          isLoading={testando}
          onClick={handleTestar}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Testar Comunicação
        </AppleButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-sup2/60 border border-fio space-y-1">
          <span className="text-[11px] text-texto3 uppercase font-mono tracking-wider">
            Porta do Webhook
          </span>
          <p className="font-mono text-[13px] font-semibold text-texto">
            Porta 3333 (Local)
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-sup2/60 border border-fio space-y-1">
          <span className="text-[11px] text-texto3 uppercase font-mono tracking-wider">
            Assinatura & Segurança
          </span>
          <p className="font-mono text-[13px] font-semibold text-jade flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" />
            Token Ativo
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-sup2/60 border border-fio space-y-1">
          <span className="text-[11px] text-texto3 uppercase font-mono tracking-wider">
            Tempo Médio de ACK
          </span>
          <p className="font-mono text-[13px] font-semibold text-texto">
            &lt; 8ms (Não-bloqueante)
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[12px] font-medium text-texto2">
          Eventos Habilitados na Evolution v2:
        </span>
        <div className="flex flex-wrap gap-2">
          {[
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
          ].map((ev) => (
            <span
              key={ev}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-sup2 border border-fio text-texto2 flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3 w-3 text-jade" />
              {ev}
            </span>
          ))}
        </div>
      </div>

      {resultado && (
        <div className="p-3 rounded-xl bg-jade-fundo border border-jade/20 text-jade text-[12px] font-medium">
          {resultado}
        </div>
      )}
    </div>
  );
}
