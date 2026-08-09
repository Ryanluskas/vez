import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { Botao } from "@/components/ui/Botao";
import { TrocaDeTema } from "@/components/conta/TrocaDeTema";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { sair } from "@/lib/acoes";

export const metadata: Metadata = { title: "Conta" };

export default async function PaginaDaConta() {
  const usuario = await usuarioAtual();

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

      <form action={sair} className="mt-8">
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
