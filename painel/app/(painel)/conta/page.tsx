import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { Botao } from "@/components/ui/Botao";
import { TrocaDeTema } from "@/components/conta/TrocaDeTema";
import { ModoAutonomo } from "@/components/conta/ModoAutonomo";
import { usuarioAtual, criarClienteServidor } from "@/lib/supabase/servidor";
import { sair } from "@/lib/acoes";

export const metadata: Metadata = { title: "Conta" };

export default async function PaginaDaConta() {
  const supabase = await criarClienteServidor();
  const [usuario, prefs] = await Promise.all([
    usuarioAtual(),
    supabase
      .from("preferencias")
      .select("modo, modo_autonomo, categorias")
      .maybeSingle(),
  ]);

  return (
    <Tela>
      <CabecalhoDeTela titulo="Conta" linha="Quem está logado neste painel." />

      <dl className="border-t border-fio">
        <Linha rotulo="E-mail">{usuario?.email}</Linha>
        <Linha rotulo="Conta criada em">
          {usuario?.created_at
            ? new Date(usuario.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : "—"}
        </Linha>
        <Linha rotulo="Tema">
          <TrocaDeTema />
        </Linha>
      </dl>

      {prefs.error ? (
        <section className="mt-10 border-t border-fio pt-7">
          <h2 className="font-display text-[18px] font-bold tracking-[-0.02em]">
            Modo autônomo
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/15_modos.sql</code> no SQL
            Editor do Supabase para usar esta parte.
          </p>
        </section>
      ) : (
        <ModoAutonomo
          modoInicial={
            prefs.data?.modo ?? (prefs.data?.modo_autonomo ? "autonomo" : "manual")
          }
          categoriasIniciais={
            prefs.data?.categorias ?? [
              "saudacao",
              "documentos",
              "prazo",
              "horario",
              "acompanhamento",
            ]
          }
        />
      )}

      <form action={sair} className="mt-10">
        <Botao tom="perigo" type="submit">
          Sair desta conta
        </Botao>
      </form>

      <p className="mt-4 text-[12px] leading-relaxed text-texto3">
        Sair daqui não desliga o motor no seu computador. Para parar de atender, feche
        o motor também.
      </p>
    </Tela>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fio py-3.5">
      <dt className="text-[13px] text-texto2">{rotulo}</dt>
      <dd className="text-[13px] text-texto">{children}</dd>
    </div>
  );
}
