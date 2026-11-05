"use client";

import { useActionState, useState } from "react";
import {
  aprovarFollowup,
  rejeitarFollowup,
  type Resultado,
} from "@/lib/acoes-painel";
import {
  Sparkles,
  ShieldCheck,
  Check,
  X,
  Phone,
  Clock,
  Edit3,
} from "lucide-react";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { AppleButton } from "@/components/ui/apple/AppleButton";

export function CartaoDeFollowup({
  id,
  nome,
  telefone,
  etapa,
  tentativa,
  motivo,
  mensagemSugerida,
}: {
  id: string;
  nome: string;
  telefone: string;
  etapa: string | null;
  tentativa: number;
  motivo: string;
  mensagemSugerida: string;
}) {
  const [texto, setTexto] = useState(mensagemSugerida);
  const [aprovacao, aprovar, aprovando] = useActionState(
    aprovarFollowup,
    {} as Resultado
  );
  const [rejeicao, rejeitar, rejeitando] = useActionState(
    rejeitarFollowup,
    {} as Resultado
  );

  const editado = texto.trim() !== mensagemSugerida.trim();

  if (aprovacao.ok) {
    return (
      <div className="rounded-2xl border border-jade/30 bg-jade-fundo p-4 text-jade flex items-center gap-3">
        <Check className="h-5 w-5 shrink-0" />
        <p className="text-[13px] font-medium">
          Follow-up aprovado para <strong>{nome}</strong> com hash SHA-256 gerado. O
          motor fará o disparo supervisionado pelo WhatsApp.
        </p>
      </div>
    );
  }

  if (rejeicao.ok) {
    return (
      <div className="rounded-2xl border border-fio bg-sup2/40 p-4 text-texto3 flex items-center gap-3">
        <X className="h-5 w-5 shrink-0" />
        <p className="text-[13px]">
          Follow-up descartado para <strong>{nome}</strong>. Nenhuma mensagem será disparada.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl p-5 space-y-4 transition-all hover:border-fio-forte">
      {/* Header do Follow-up */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-display text-[15px] font-semibold text-texto tracking-tight">
            {nome}
          </span>
          <span className="font-mono text-[12px] text-texto3 flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {telefone}
          </span>

          <AppleBadge variant="warning">
            Tentativa {tentativa}/3
          </AppleBadge>

          {etapa && (
            <AppleBadge variant="outline">
              {etapa.replace(/_/g, " ")}
            </AppleBadge>
          )}

          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-jade bg-jade-fundo px-2 py-0.5 rounded-full border border-jade/20">
            <ShieldCheck className="h-3 w-3" />
            SHA-256
          </span>
        </div>

        <span className="text-[11px] text-texto3 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Expira em 24h
        </span>
      </div>

      {/* Diagnóstico da IA */}
      <div className="p-3 rounded-xl bg-sup2/50 border border-fio/60 text-[12px] text-texto2 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-jade shrink-0 mt-0.5" />
        <div>
          <strong className="text-texto">Diagnóstico comercial:</strong> {motivo}
        </div>
      </div>

      {/* Editor da Mensagem Sugerida */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <label htmlFor={`texto-${id}`} className="font-medium text-texto2 flex items-center gap-1">
            <Edit3 className="h-3.5 w-3.5" />
            Mensagem que será enviada:
          </label>
          {editado && (
            <span className="text-[11px] text-jade font-medium">Editado por você</span>
          )}
        </div>

        <textarea
          id={`texto-${id}`}
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="w-full rounded-xl border border-fio bg-sup2 p-3 text-[13px] text-texto placeholder:text-texto3 focus:border-jade focus:bg-sup focus:outline-none transition-all leading-relaxed"
        />
      </div>

      {/* Ações de Aprovação e Rejeição */}
      <div className="flex items-center justify-end gap-2.5 pt-2">
        <form action={rejeitar}>
          <input type="hidden" name="id" value={id} />
          <AppleButton
            type="submit"
            size="sm"
            variant="ghost"
            disabled={rejeitando || aprovando}
            icon={<X className="h-3.5 w-3.5" />}
          >
            {rejeitando ? "Descartando…" : "Descartar"}
          </AppleButton>
        </form>

        <form action={aprovar}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="texto_editado" value={texto} />
          <AppleButton
            type="submit"
            size="sm"
            variant="primary"
            disabled={aprovando || rejeitando || !texto.trim()}
            icon={<Check className="h-3.5 w-3.5" />}
          >
            {aprovando ? "Aprovando…" : "Aprovar Envio"}
          </AppleButton>
        </form>
      </div>

      {(aprovacao.erro || rejeicao.erro) && (
        <p className="text-[12px] text-erro font-medium">
          {aprovacao.erro || rejeicao.erro}
        </p>
      )}
    </div>
  );
}
