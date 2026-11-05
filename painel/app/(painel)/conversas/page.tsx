import type { Metadata } from "next";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { CentralAtendimento } from "@/components/conversas/CentralAtendimento";
import {
  obterMensagensDaConversa,
  obterFatosDaConversa,
} from "@/lib/dados";
import type { Conversa } from "@/lib/tipos";

export const metadata: Metadata = {
  title: "Atendimento · Vez",
  description: "Central de atendimento inteligente WhatsApp",
};

export default async function PaginaDeConversas({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await criarClienteServidor();

  const { data: conversasData } = await supabase
    .from("conversas")
    .select(
      "id, telefone, nome, estagio, etapa, ultima_mensagem, atualizado_em, atender, seguir, followups_enviados, ultima_direcao, so_voce, qualificacao, opt_out, opt_out_em, motivo_opt_out, origem_contato, observacoes, motivo_perda"
    )
    .order("atualizado_em", { ascending: false })
    .limit(100);

  const conversas: Conversa[] = (conversasData as Conversa[]) ?? [];

  // Se houver conversa selecionada, carrega mensagens e fatos
  const conversaAtivaId = id || (conversas.length > 0 ? conversas[0].id : null);

  const [mensagensIniciais, fatosIniciais] = await Promise.all([
    conversaAtivaId ? obterMensagensDaConversa(conversaAtivaId) : Promise.resolve([]),
    conversaAtivaId ? obterFatosDaConversa(conversaAtivaId) : Promise.resolve([]),
  ]);

  return (
    <CentralAtendimento
      conversas={conversas}
      conversaInicialId={conversaAtivaId}
      mensagensIniciais={mensagensIniciais}
      fatosIniciais={fatosIniciais}
    />
  );
}
