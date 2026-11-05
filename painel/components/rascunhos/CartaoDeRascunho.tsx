"use client";

import { useActionState, useState } from "react";
import {
  aprovarRascunho,
  descartarRascunho,
  type Resultado,
} from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { Check, Trash2, Edit3, MessageSquare, Phone, Sparkles } from "lucide-react";

export function CartaoDeRascunho({
  id,
  nome,
  telefone,
  categoria,
  origem,
  textoSugerido,
  perguntaOriginal,
}: {
  id: string;
  nome: string;
  telefone: string;
  categoria: string | null;
  origem?: string | null;
  textoSugerido: string;
  perguntaOriginal: string | null;
}) {
  const [texto, setTexto] = useState(textoSugerido);
  const [aprovacao, aprovar, aprovando] = useActionState(
    aprovarRascunho,
    {} as Resultado
  );
  const [descarte, descartar, descartando] = useActionState(
    descartarRascunho,
    {} as Resultado
  );

  const editado = texto.trim() !== textoSugerido.trim();

  if (aprovacao.ok) {
    return (
      <div className="rounded-2xl border border-jade/30 bg-jade-fundo p-4 text-jade flex items-center gap-3">
        <Check className="h-5 w-5 shrink-0" />
        <p className="text-[14px] font-medium">
          Rascunho aprovado para <strong>{nome}</strong>. O motor fará o envio em instantes pelo WhatsApp.
        </p>
      </div>
    );
  }

  if (descarte.ok) {
    return (
      <div className="rounded-2xl border border-fio bg-sup2/40 p-4 text-texto3 flex items-center gap-3">
        <Trash2 className="h-5 w-5 shrink-0" />
        <p className="text-[14px]">
          Rascunho descartado para <strong>{nome}</strong>. A conversa foi devolvida ao fluxo normal.
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl p-5 space-y-4 transition-all hover:border-fio-forte shadow-sm">
      {/* Header do Rascunho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fio/60">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-display text-[16px] font-semibold text-texto tracking-tight">
            {nome}
          </span>
          <span className="font-mono text-[12px] text-texto3 flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {telefone}
          </span>

          {categoria && (
            <AppleBadge variant="outline">
              {categoria}
            </AppleBadge>
          )}

          {origem === "lista" && (
            <AppleBadge variant="success">
              Importado de Lista
            </AppleBadge>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono text-texto3">
          <Sparkles className="h-3.5 w-3.5 text-jade" />
          <span>Supervisão Humana Obrigatória</span>
        </div>
      </div>

      {/* Pergunta Original do Cliente (se houver) */}
      {perguntaOriginal && (
        <div className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-texto3">
            O que o cliente perguntou
          </span>
          <p className="text-[13px] text-texto2 bg-sup2/40 p-3 rounded-xl border border-fio/40 leading-relaxed">
            &quot;{perguntaOriginal}&quot;
          </p>
        </div>
      )}

      {/* Editor do Texto Sugerido */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-texto3 flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-jade" />
            Mensagem que será enviada
          </span>
          {editado && (
            <span className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
              <Edit3 className="h-3 w-3" />
              Texto personalizado pelo consultor
            </span>
          )}
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={Math.min(8, Math.max(3, Math.ceil(texto.length / 55)))}
          aria-label={`Mensagem para ${nome}`}
          className={cn(
            "w-full resize-y rounded-xl border border-fio bg-sup px-4 py-3",
            "text-[14px] leading-relaxed text-texto placeholder:text-texto3 transition-all",
            "hover:border-fio-forte focus:border-jade focus:outline-none focus:ring-2 focus:ring-jade/20"
          )}
        />
      </div>

      {/* Ações de Aprovação e Descarte */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-fio/60">
        <div className="flex items-center gap-2">
          <form action={aprovar}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="texto" value={texto} />
            <AppleButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={aprovando}
              disabled={aprovando || descartando || !texto.trim()}
              icon={<Check className="h-4 w-4" />}
            >
              {aprovando ? "Enviando…" : "Aprovar e Enviar"}
            </AppleButton>
          </form>

          <form action={descartar}>
            <input type="hidden" name="id" value={id} />
            <AppleButton
              type="submit"
              variant="ghost"
              size="md"
              isLoading={descartando}
              disabled={aprovando || descartando}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Descartar
            </AppleButton>
          </form>
        </div>

        <p className="text-[11px] text-texto3">
          Ao aprovar, a mensagem sai com a chancela do seu número no WhatsApp.
        </p>
      </div>

      {(aprovacao.erro || descarte.erro) && (
        <div className="p-3 rounded-xl bg-erro-fundo border border-erro/30 text-erro text-[13px]">
          {aprovacao.erro ?? descarte.erro}
        </div>
      )}
    </article>
  );
}
