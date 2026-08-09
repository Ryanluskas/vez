import type { Metadata } from "next";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Rascunhos" };

type LinhaDeRascunho = {
  id: string;
  texto_sugerido: string;
  criado_em: string;
  conversas: { nome: string | null; telefone: string } | null;
};

export default async function PaginaDeRascunhos() {
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("rascunhos")
    .select("id, texto_sugerido, criado_em, conversas(nome, telefone)")
    .eq("status", "pendente")
    .order("criado_em", { ascending: true })
    .returns<LinhaDeRascunho[]>();

  const rascunhos = data ?? [];

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Rascunhos"
        linha="Respostas que o bot escreveu no seu jeito. Nada sai daqui sem você aprovar."
        rotulo="Nada é enviado sozinho"
      />

      {rascunhos.length === 0 ? (
        <Vazio
          titulo="Nenhum rascunho esperando"
          corpo="Quando o bot conseguir responder algo sozinho — horário, documentos, dúvida simples — ele escreve aqui e espera seu aval antes de mandar."
        />
      ) : (
        <div className="border-b border-fio">
          {rascunhos.map((r) => (
            <article key={r.id} className="border-t border-fio py-3.5 pr-1 pl-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[14px] text-texto">
                  {r.conversas?.nome ?? "Sem nome"}
                </span>
                <span className="num text-[12px] text-texto3">
                  {r.conversas?.telefone ?? ""}
                </span>
              </div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-texto2">
                {r.texto_sugerido}
              </p>
            </article>
          ))}
        </div>
      )}
    </Tela>
  );
}
