import { criarClienteServidor } from "@/lib/supabase/servidor";

export type ResumoDoPainel = {
  abertas: number;
  rascunhos: number;
  bancoPronto: boolean;
};

/*
  Contadores do rail. Se as tabelas ainda nao existem (SQL nao rodado),
  devolve bancoPronto: false pra tela pedir isso de forma clara,
  em vez de estourar uma stack trace na cara do consultor.
*/
export async function resumoDoPainel(): Promise<ResumoDoPainel> {
  const supabase = await criarClienteServidor();

  const [fila, rascunhos] = await Promise.all([
    supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
    supabase
      .from("rascunhos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
  ]);

  if (fila.error || rascunhos.error) {
    return { abertas: 0, rascunhos: 0, bancoPronto: false };
  }

  return {
    abertas: fila.count ?? 0,
    rascunhos: rascunhos.count ?? 0,
    bancoPronto: true,
  };
}
