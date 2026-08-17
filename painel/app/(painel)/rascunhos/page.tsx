import type { Metadata } from "next";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { CartaoDeRascunho } from "@/components/rascunhos/CartaoDeRascunho";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Rascunhos" };

type LinhaDeRascunho = {
  id: string;
  texto_sugerido: string;
  categoria: string | null;
  origem: string | null;
  criado_em: string;
  conversas: { nome: string | null; telefone: string } | null;
  pendencias: { pergunta: string } | null;
};

export default async function PaginaDeRascunhos() {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("rascunhos")
    .select(
      "id, texto_sugerido, categoria, origem, criado_em, conversas(nome, telefone), pendencias(pergunta)"
    )
    .eq("status", "pendente")
    .order("criado_em", { ascending: true })
    .returns<LinhaDeRascunho[]>();

  const rascunhos = data ?? [];

  // As colunas categoria/id_pendencia nascem no 04_fase3.sql. Sem ele a
  // consulta falha, e um estado vazio mentiroso seria pior que o recado.
  if (error) {
    return (
      <Tela>
        <CabecalhoDeTela
          titulo="Rascunhos"
          linha="Falta uma parte do banco para esta tela funcionar."
        />
        <div className="rounded-lg border border-fio bg-sup p-5">
          <p className="text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/04_fase3.sql</code> no SQL
            Editor do Supabase e recarregue.
          </p>
        </div>
      </Tela>
    );
  }

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Rascunhos"
        linha={
          rascunhos.length === 0
            ? "Nada esperando aprovação."
            : `${rascunhos.length} ${
                rascunhos.length === 1 ? "mensagem escrita" : "mensagens escritas"
              } no seu jeito, esperando seu aval.`
        }
        rotulo="Nada sai sem você ler"
      />

      {rascunhos.length === 0 ? (
        <Vazio
          titulo="Nenhum rascunho esperando"
          corpo="Quando o bot conseguir responder algo sozinho, ou quando você responder alguém da Fila, a mensagem aparece aqui pronta — você lê, ajusta se quiser, e só então ela sai."
        />
      ) : (
        <div className="border-b border-fio">
          {rascunhos.map((r) => (
            <CartaoDeRascunho
              key={r.id}
              id={r.id}
              nome={r.conversas?.nome ?? "Sem nome"}
              telefone={r.conversas?.telefone ?? ""}
              categoria={r.categoria}
              origem={r.origem}
              textoSugerido={r.texto_sugerido}
              perguntaOriginal={r.pendencias?.pergunta ?? null}
            />
          ))}
        </div>
      )}
    </Tela>
  );
}
