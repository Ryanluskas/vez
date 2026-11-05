import type { Metadata } from "next";
import { CartaoDeNumero } from "@/components/conexao/CartaoDeNumero";
import { AdicionarNumero } from "@/components/conexao/AdicionarNumero";
import { DiagnosticoWebhook } from "@/components/conexao/DiagnosticoWebhook";
import { ControleAgenteGlobal } from "@/components/conexao/ControleAgenteGlobal";
import { conexoesDoUsuario } from "@/lib/dados";
import { Cpu } from "lucide-react";

export const metadata: Metadata = {
  title: "WhatsApp & Evolution · Vez",
  description: "Gerenciamento de instâncias e conexões Evolution API v2",
};

export default async function PaginaDeConexao() {
  const { conexoes } = await conexoesDoUsuario();

  const algumLigado = conexoes.some((c) => c.ligado);
  const ativos = conexoes.filter((c) => c.ativa).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8 space-y-8 select-none">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-mono uppercase tracking-wider text-jade font-semibold">
            Gateway de Comunicação
          </span>
          <span className="h-1 w-1 rounded-full bg-texto3" />
          <span className="text-[12px] text-texto3">Evolution API v2.2.3</span>
        </div>
        <h1 className="mt-1 font-display text-[28px] sm:text-[32px] font-bold tracking-tight text-texto">
          Gerenciador WhatsApp
        </h1>
        <p className="mt-1 text-[14px] text-texto2">
          Instâncias conectadas, leitura de QR Code em tempo real e diagnóstico de webhooks.
        </p>
      </div>

      {/* Controle de Ativação do Agente e Marco Temporal */}
      <ControleAgenteGlobal />

      {/* Lista de Instâncias */}
      <div className="space-y-4">
        {conexoes.map((c) => (
          <CartaoDeNumero key={c.id} conexao={c} />
        ))}
      </div>

      {/* Adicionar Nova Instância */}
      <AdicionarNumero quantos={ativos} />

      {/* Diagnóstico de Webhooks */}
      <DiagnosticoWebhook />

      {/* Guia de Inicialização do Gateway */}
      {!algumLigado && (
        <div className="rounded-2xl border border-fio bg-sup/40 p-6 space-y-3">
          <h4 className="font-display text-[15px] font-semibold text-texto tracking-tight flex items-center gap-2">
            <Cpu className="h-4 w-4 text-jade" />
            Como inicializar a Evolution API
          </h4>
          <p className="text-[13px] text-texto2 leading-relaxed">
            Se a Evolution API estiver rodando via Docker, execute <code className="font-mono text-texto bg-sup2 px-2 py-0.5 rounded-md">docker compose up -d</code>. 
            Caso queira rodar diretamente no Windows sem contêineres, adicione <code className="font-mono text-texto bg-sup2 px-2 py-0.5 rounded-md">VEZ_GATEWAY=legacy</code> no arquivo <code className="font-mono">motor/.env</code>.
          </p>
        </div>
      )}
    </div>
  );
}
