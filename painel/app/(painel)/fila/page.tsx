import type { Metadata } from "next";
import { ItemDaFila } from "@/components/fila/ItemDaFila";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Atalho } from "@/lib/tipos";
import { CheckCircle2 } from "lucide-react";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";

export const metadata: Metadata = {
  title: "Fila de Triage · Vez",
  description: "Fila de atendimento humano e intervenção do consultor",
};

type LinhaDaFila = {
  id: string;
  pergunta: string;
  contexto: string | null;
  motivo: string | null;
  categoria: string | null;
  criado_em: string;
  conversas: { nome: string | null; telefone: string } | null;
};

export default async function PaginaDaFila() {
  const supabase = await criarClienteServidor();

  const [{ data }, listaDeAtalhos] = await Promise.all([
    supabase
      .from("pendencias")
      .select("id, pergunta, contexto, motivo, categoria, criado_em, conversas(nome, telefone)")
      .eq("status", "aberta")
      .order("criado_em", { ascending: true })
      .returns<LinhaDaFila[]>(),
    supabase
      .from("atalhos")
      .select("id, titulo, texto, ordem")
      .order("ordem")
      .order("criado_em")
      .returns<Atalho[]>(),
  ]);

  const pendencias = data ?? [];
  const atalhos = listaDeAtalhos.data ?? [];
  const agoraServidor = new Date().toISOString();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8 space-y-6 select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono uppercase tracking-wider text-jade font-semibold">
              Prioridade Absoluta
            </span>
            <span className="h-1 w-1 rounded-full bg-texto3" />
            <span className="text-[12px] text-texto3">CapitalCred</span>
          </div>
          <h1 className="mt-1 font-display text-[28px] sm:text-[32px] font-bold tracking-tight text-texto">
            Fila de Triage
          </h1>
          <p className="mt-1 text-[14px] text-texto2">
            Clientes aguardando números de parcelas, margem ou simulação que a IA não tem permissão para inventar.
          </p>
        </div>

        <AppleBadge
          variant={pendencias.length > 0 ? "warning" : "success"}
          dot
        >
          {pendencias.length > 0
            ? `${pendencias.length} aguardando`
            : "Fila Limpa"}
        </AppleBadge>
      </div>

      {pendencias.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-fio bg-sup/30 p-12 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-jade mx-auto stroke-[1.5]" />
          <h3 className="font-display text-[16px] font-semibold text-texto">
            Nenhum cliente travado na fila
          </h3>
          <p className="text-[13px] text-texto2 max-w-md mx-auto leading-relaxed">
            Assim que um contato perguntar quanto libera ou valores de contratos, a
            conversa é congelada com segurança e a pergunta aparece aqui na ordem de chegada.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendencias.map((p) => (
            <ItemDaFila
              key={p.id}
              id={p.id}
              criadoEm={p.criado_em}
              agoraServidor={agoraServidor}
              nome={p.conversas?.nome ?? "Sem nome"}
              telefone={p.conversas?.telefone ?? ""}
              pergunta={p.pergunta}
              contexto={p.contexto}
              motivo={p.motivo}
              categoria={p.categoria}
              atalhos={atalhos}
            />
          ))}
        </div>
      )}
    </div>
  );
}
