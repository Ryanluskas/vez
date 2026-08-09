import { redirect } from "next/navigation";
import { BarraDeEstado } from "@/components/painel/BarraDeEstado";
import { Rail } from "@/components/painel/Rail";
import { Pulso } from "@/components/painel/Pulso";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { resumoDoPainel, estadoDaConexao } from "@/lib/dados";

export default async function LayoutDoPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  // O proxy ja barra quem nao esta logado; aqui e a segunda camada.
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");

  const [{ abertas, rascunhos, bancoPronto }, conexao] = await Promise.all([
    resumoDoPainel(),
    estadoDaConexao(),
  ]);

  const motorLigado = conexao.ligado;

  return (
    <div className="flex min-h-screen flex-col">
      <BarraDeEstado abertas={abertas} motorLigado={motorLigado} />

      <div className="flex flex-1 flex-col md:flex-row">
        <Rail abertas={abertas} rascunhos={rascunhos} motorLigado={motorLigado} />

        <main className="min-w-0 flex-1">
          {!bancoPronto ? (
            <div className="border-b border-fio bg-sup px-5 py-3 sm:px-8">
              <p className="text-[13px] text-texto">
                As tabelas ainda não existem neste projeto do Supabase.
              </p>
              <p className="mt-1 text-[12px] text-texto2">
                Rode <code className="num text-texto">banco/01_tabelas.sql</code> e{" "}
                <code className="num text-texto">banco/02_rls.sql</code> no SQL Editor do
                Supabase e recarregue esta página.
              </p>
            </div>
          ) : null}

          {children}
        </main>
      </div>

      <Pulso />
    </div>
  );
}
