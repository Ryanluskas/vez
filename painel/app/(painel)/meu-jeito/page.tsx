import type { Metadata } from "next";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { ApagarExemplo } from "@/components/conta/ApagarExemplo";
import { Atalhos } from "@/components/conta/Atalhos";
import { Conhecimento } from "@/components/conta/Conhecimento";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { RespostaBoa, Atalho, Conhecimento as Fato } from "@/lib/tipos";

export const metadata: Metadata = { title: "Meu jeito" };

export default async function PaginaMeuJeito() {
  const supabase = await criarClienteServidor();

  const [exemplosVindos, atalhosVindos, fatosVindos] = await Promise.all([
    supabase
      .from("respostas_boas")
      .select("id, categoria, mensagem_cliente, resposta_ryan, criado_em")
      .order("criado_em", { ascending: false })
      .returns<RespostaBoa[]>(),
    supabase
      .from("atalhos")
      .select("id, titulo, texto, ordem")
      .order("ordem")
      .order("criado_em")
      .returns<Atalho[]>(),
    supabase
      .from("conhecimento")
      .select("id, assunto, conteudo, ordem")
      .order("ordem")
      .order("criado_em")
      .returns<Fato[]>(),
  ]);

  const exemplos = exemplosVindos.data ?? [];
  const atalhos = atalhosVindos.data ?? [];
  const fatos = fatosVindos.data ?? [];
  const faltaTabela = !!atalhosVindos.error;
  const faltaConhecimento = !!fatosVindos.error;

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Meu jeito"
        linha="Os exemplos que o bot lê antes de escrever. Cada resposta sua que você aprova entra aqui."
        rotulo={exemplos.length > 0 ? `${exemplos.length} exemplos` : undefined}
      />

      {exemplos.length === 0 ? (
        <Vazio
          titulo="O bot ainda não tem exemplos gravados"
          corpo="Toda vez que você aprova ou edita uma resposta na Fila ou em Rascunhos, ela se transforma automaticamente em repertório de aprendizado para a IA."
        />
      ) : (
        <div className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-5 divide-y divide-fio/40 space-y-4">
          {exemplos.map((e) => (
            <article key={e.id} className="pt-3 first:pt-0">
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

      {faltaTabela ? (
        <section className="mt-10 border-t border-fio pt-7">
          <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
            Respostas curinga
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/11_atalhos.sql</code> no SQL
            Editor do Supabase para usar esta parte.
          </p>
        </section>
      ) : (
        <Atalhos atalhos={atalhos} />
      )}

      {faltaConhecimento ? (
        <section className="mt-10 border-t border-fio pt-7">
          <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
            O que o bot sabe
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/12_conhecimento.sql</code> no
            SQL Editor do Supabase para usar esta parte.
          </p>
        </section>
      ) : (
        <Conhecimento fatos={fatos} />
      )}
    </Tela>
  );
}
