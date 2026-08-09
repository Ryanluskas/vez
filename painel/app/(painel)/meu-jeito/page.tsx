import type { Metadata } from "next";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { ApagarExemplo } from "@/components/conta/ApagarExemplo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { RespostaBoa } from "@/lib/tipos";

export const metadata: Metadata = { title: "Meu jeito" };

export default async function PaginaMeuJeito() {
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("respostas_boas")
    .select("id, categoria, mensagem_cliente, resposta_ryan, criado_em")
    .order("criado_em", { ascending: false })
    .returns<RespostaBoa[]>();

  const exemplos = data ?? [];

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Meu jeito"
        linha="Os exemplos que o bot lê antes de escrever. Cada resposta sua que você aprova entra aqui."
        rotulo={exemplos.length > 0 ? `${exemplos.length} exemplos` : undefined}
      />

      {exemplos.length === 0 ? (
        <Vazio
          titulo="O bot ainda não conhece seu jeito"
          corpo="Não tem treinamento nem mensalidade: toda vez que você aprova uma resposta, ela vira exemplo aqui. O bot lê os exemplos da mesma categoria antes de escrever a próxima."
        />
      ) : (
        <div className="border-b border-fio">
          {exemplos.map((e) => (
            <article key={e.id} className="border-t border-fio py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="rotulo">{e.categoria}</span>
                <ApagarExemplo id={e.id} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-texto2">
                <span className="text-texto3">Cliente: </span>
                {e.mensagem_cliente}
              </p>
              <p className="mt-1.5 border-l-2 border-jade pl-3 text-[14px] leading-relaxed text-texto">
                {e.resposta_ryan}
              </p>
            </article>
          ))}
        </div>
      )}
    </Tela>
  );
}
