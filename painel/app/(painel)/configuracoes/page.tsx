import type { Metadata } from "next";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { obterConfigIA } from "@/lib/dados";
import { PainelAjustesApple } from "@/components/configuracoes/PainelAjustesApple";

export const metadata: Metadata = {
  title: "Ajustes & Configurações · Vez",
  description: "Configurações da empresa, consultores, automações e aparência",
};

export default async function PaginaDeConfiguracoes() {
  const [usuario, configIA] = await Promise.all([
    usuarioAtual(),
    obterConfigIA(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono uppercase tracking-wider text-jade font-semibold">
            Preferências do Sistema
          </span>
          <span className="h-1 w-1 rounded-full bg-texto3" />
          <span className="text-[12px] text-texto3">CapitalCred</span>
        </div>
        <h1 className="mt-1 font-display text-[28px] sm:text-[32px] font-bold tracking-tight text-texto">
          Ajustes
        </h1>
        <p className="mt-1 text-[14px] text-texto2">
          Gerenciamento da operação, equipe, automações comerciais e preferências visuais.
        </p>
      </div>

      <PainelAjustesApple usuarioEmail={usuario?.email || ""} configIA={configIA} />
    </div>
  );
}
