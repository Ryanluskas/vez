import type { Metadata } from "next";
import { CartaoDeFollowup } from "@/components/followups/CartaoDeFollowup";
import { followupsPendentes } from "@/lib/dados";
import { Sparkles } from "lucide-react";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";

export const metadata: Metadata = {
  title: "Follow-ups · Vez",
  description: "Aprovação supervisionada de cobranças e follow-ups comerciais",
};

export default async function PaginaDeFollowups() {
  const { followups } = await followupsPendentes();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8 space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono uppercase tracking-wider text-jade font-semibold">
              Supervisão Humana Ativa
            </span>
            <span className="h-1 w-1 rounded-full bg-texto3" />
            <span className="text-[12px] text-texto3">CapitalCred</span>
          </div>
          <h1 className="mt-1 font-display text-[28px] sm:text-[32px] font-bold tracking-tight text-texto">
            Central de Follow-ups
          </h1>
          <p className="mt-1 text-[14px] text-texto2">
            Sugestões geradas pela IA para clientes que esfriaram. Nenhuma mensagem externa é disparada sem o seu aval.
          </p>
        </div>

        <AppleBadge variant="success" dot>
          Proteção SHA-256 Ativa
        </AppleBadge>
      </div>

      {followups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fio bg-sup/30 p-12 text-center space-y-3">
          <Sparkles className="h-10 w-10 text-texto3 mx-auto stroke-[1.5]" />
          <h3 className="font-display text-[16px] font-semibold text-texto">
            Nenhum cliente esfriando agora
          </h3>
          <p className="text-[13px] text-texto2 max-w-md mx-auto leading-relaxed">
            Quando um contato parar de responder no WhatsApp, o Vez formulará uma sugestão
            respeitando a cadência de 8h às 20h e trará para cá para sua aprovação.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {followups.map((f) => (
            <CartaoDeFollowup
              key={f.id}
              id={f.id}
              nome={f.conversas?.nome ?? "Sem nome"}
              telefone={f.conversas?.telefone ?? ""}
              etapa={f.conversas?.etapa ?? f.estagio_comercial}
              tentativa={f.tentativa}
              motivo={f.motivo}
              mensagemSugerida={f.mensagem_sugerida}
            />
          ))}
        </div>
      )}
    </div>
  );
}
