import type { Metadata } from "next";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { TabelaClientes } from "@/components/clientes/TabelaClientes";
import type { Conversa } from "@/lib/tipos";

export const metadata: Metadata = {
  title: "CRM & Clientes · Vez",
  description: "Gestão comercial de leads e clientes CapitalCred",
};

export default async function PaginaDeClientes() {
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("conversas")
    .select(
      "id, telefone, nome, estagio, etapa, ultima_mensagem, atualizado_em, atender, seguir, followups_enviados, ultima_direcao, so_voce, qualificacao"
    )
    .order("atualizado_em", { ascending: false })
    .limit(200);

  const clientes: Conversa[] = (data as Conversa[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono uppercase tracking-wider text-jade font-semibold">
            Pipeline Comercial
          </span>
          <span className="h-1 w-1 rounded-full bg-texto3" />
          <span className="text-[12px] text-texto3">CapitalCred</span>
        </div>
        <h1 className="mt-1 font-display text-[28px] sm:text-[32px] font-bold tracking-tight text-texto">
          CRM & Clientes
        </h1>
        <p className="mt-1 text-[14px] text-texto2">
          Gestão de contatos, qualificação comercial e histórico de atendimento.
        </p>
      </div>

      <TabelaClientes clientes={clientes} />
    </div>
  );
}
