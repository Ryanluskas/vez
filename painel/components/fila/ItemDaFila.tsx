"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Responder } from "./Responder";
import type { Atalho } from "@/lib/tipos";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import {
  formatarEspera,
  temperaturaDaEspera,
  NOME_DA_TEMPERATURA,
} from "./espera";
import { Clock, Phone, ChevronDown, HelpCircle, ShieldAlert } from "lucide-react";

export type ItemDaFilaProps = {
  id: string;
  criadoEm: string;
  agoraServidor: string;
  nome: string;
  telefone: string;
  pergunta: string;
  contexto: string | null;
  motivo: string | null;
  categoria: string | null;
  atalhos: Atalho[];
};

const ROTULO_DA_CATEGORIA: Record<string, string> = {
  valor: "Simulação de Valor",
  prazo: "Prazo & Parcelas",
  documentos: "Envio de Documentos",
  status: "Andamento de Proposta",
  saudacao: "Atendimento Geral",
  horario: "Horário Comercial",
  outro: "Consulta Específica",
};

export function ItemDaFila({
  id,
  criadoEm,
  agoraServidor,
  nome,
  telefone,
  pergunta,
  contexto,
  motivo,
  categoria,
  atalhos,
}: ItemDaFilaProps) {
  const inicio = new Date(criadoEm).getTime();
  const [esperaMs, setEsperaMs] = useState(
    () => new Date(agoraServidor).getTime() - inicio
  );
  const [expandirContexto, setExpandirContexto] = useState(false);

  useEffect(() => {
    const marcar = () => setEsperaMs(Date.now() - inicio);
    marcar();
    const relogio = setInterval(marcar, 1000);
    return () => clearInterval(relogio);
  }, [inicio]);

  const temperatura = temperaturaDaEspera(esperaMs);

  const variantBadge =
    temperatura === "nova"
      ? "success"
      : temperatura === "esperando"
      ? "warning"
      : "destructive";

  return (
    <article className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl p-5 space-y-4 transition-all hover:border-fio-forte shadow-sm">
      {/* Header do Item: Nome, Telefone, Categoria e Cronômetro de Espera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fio/60">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-display text-[16px] font-semibold text-texto tracking-tight">
            {nome}
          </span>
          <span className="font-mono text-[12px] text-texto3 flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {telefone}
          </span>

          {categoria ? (
            <AppleBadge variant="outline">
              {ROTULO_DA_CATEGORIA[categoria] ?? categoria}
            </AppleBadge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <AppleBadge variant={variantBadge} dot>
            <span className="flex items-center gap-1 font-mono num">
              <Clock className="h-3 w-3" />
              {formatarEspera(esperaMs)} · {NOME_DA_TEMPERATURA[temperatura]}
            </span>
          </AppleBadge>
        </div>
      </div>

      {/* Pergunta do Cliente */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-texto3">
          <HelpCircle className="h-3.5 w-3.5 text-jade" />
          <span>Pergunta do Cliente</span>
        </div>
        <p className="text-[15px] font-normal leading-relaxed text-texto bg-sup2/40 p-3.5 rounded-xl border border-fio/40">
          &quot;{pergunta}&quot;
        </p>
      </div>

      {/* Motivo do Bloqueio Determinístico */}
      {motivo ? (
        <div className="flex items-center gap-2 text-[12px] text-texto2 bg-morno/10 border border-morno/20 px-3 py-1.5 rounded-xl">
          <ShieldAlert className="h-3.5 w-3.5 text-morno shrink-0" />
          <span>
            Congelado pela barreira financeira: <strong>{motivo}</strong>.
          </span>
        </div>
      ) : null}

      {/* Histórico Anterior Expansível */}
      {contexto ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpandirContexto(!expandirContexto)}
            className="flex items-center gap-1.5 text-[12px] text-texto3 hover:text-texto transition-colors cursor-pointer"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                expandirContexto && "rotate-180"
              )}
            />
            <span>
              {expandirContexto
                ? "Ocultar histórico da conversa"
                : "Ver histórico das últimas mensagens"}
            </span>
          </button>

          {expandirContexto && (
            <pre className="mt-2.5 whitespace-pre-wrap rounded-xl border border-fio bg-sup p-3 font-sans text-[12px] leading-relaxed text-texto2 max-h-48 overflow-y-auto">
              {contexto}
            </pre>
          )}
        </div>
      ) : null}

      {/* Caixa de Resposta Humana Integrada */}
      <div className="pt-2 border-t border-fio/60">
        <Responder
          idPendencia={id}
          atalhos={atalhos}
          categoria={categoria}
          nomeCliente={nome}
          perguntaCliente={pergunta}
        />
      </div>
    </article>
  );
}
