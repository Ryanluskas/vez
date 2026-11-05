import { redirect } from "next/navigation";
import { BarraDeEstado } from "@/components/painel/BarraDeEstado";
import { Rail } from "@/components/painel/Rail";
import { MobileBottomBar } from "@/components/painel/MobileBottomBar";
import { Pulso } from "@/components/painel/Pulso";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { resumoDoPainel, algumMotorLigado } from "@/lib/dados";

export default async function LayoutDoPainel({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/entrar");

  const [{ abertas, rascunhos, followups, bancoPronto }, motorLigado] = await Promise.all([
    resumoDoPainel(),
    algumMotorLigado(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-fundo">
      <BarraDeEstado abertas={abertas} motorLigado={motorLigado} />

      <div className="flex flex-1 flex-col md:flex-row pb-16 md:pb-0">
        <Rail
          abertas={abertas}
          rascunhos={rascunhos}
          followups={followups}
          motorLigado={motorLigado}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden">
          {!bancoPronto ? (
            <div className="m-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 sm:p-6 text-amber-500">
              <p className="text-[14px] font-semibold tracking-tight">
                Instalação de tabelas pendente no Supabase
              </p>
              <p className="mt-1 text-[13px] text-amber-500/90 leading-relaxed">
                Execute o script unificado <code className="font-mono font-bold">banco/tudo.sql</code> no
                SQL Editor do seu painel do Supabase e recarregue a página.
              </p>
            </div>
          ) : null}

          {children}
        </main>
      </div>

      <MobileBottomBar abertas={abertas} followups={followups} />
      <Pulso />
    </div>
  );
}
