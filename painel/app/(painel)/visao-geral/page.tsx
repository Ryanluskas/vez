import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import { obterMetricasOperacao } from "@/lib/dados";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { GraficoTrafego } from "@/components/painel/GraficoTrafego";

export const metadata: Metadata = {
  title: "Visão Geral · Vez",
  description: "Painel de controle operacional CapitalCred Consignados e WhatsApp",
};

export default async function PaginaVisaoGeral() {
  const metricas = await obterMetricasOperacao();

  const leadsQualificados = metricas.leadsQuentes + metricas.leadsMornos;
  const totalClassificados =
    metricas.leadsQuentes + metricas.leadsMornos + metricas.leadsFrios;

  return (
    <div className="w-full max-w-[1440px] px-6 py-6 sm:px-8 space-y-6 select-none">
      {/* 1. Header Sóbrio de Operador */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-3 border-b border-fio">
        <div>
          <span className="text-[12px] font-mono uppercase tracking-wider text-texto2">
            CapitalCred Consignados / Operação Comercial
          </span>
          <h1 className="mt-1 text-[24px] sm:text-[28px] font-semibold tracking-tight text-texto">
            Visão Geral
          </h1>
          <p className="mt-0.5 text-[13px] text-texto2">
            Acompanhamento da esteira de crédito e mensagens via WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {metricas.aguardandoConsultor > 0 ? (
            <Link
              href="/fila"
              className="text-[12px] text-atencao font-medium hover:underline flex items-center gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-atencao" />
              Fila ({metricas.aguardandoConsultor})
            </Link>
          ) : (
            <span className="text-[12px] text-texto2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-texto3" />
              Fila em dia
            </span>
          )}

          <Link href="/conversas">
            <AppleButton
              variant="primary"
              size="sm"
              icon={<MessageSquare className="h-3.5 w-3.5" />}
            >
              Atendimento ao Vivo
            </AppleButton>
          </Link>
        </div>
      </div>

      {/* 2. Faixa Única de KPIs (Hairlines Finas, Sem Ícones, Foco em Números) */}
      <div className="border border-fio rounded-[6px] bg-sup grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-fio">
        {/* Coluna 1: Clientes */}
        <div className="p-4 space-y-1">
          <span className="text-[12px] font-medium text-texto2 block">
            Clientes Registrados
          </span>
          <span className="text-[28px] font-semibold font-mono tabular-nums text-texto block leading-none">
            {metricas.totalConversas}
          </span>
          <span className="text-[12px] text-texto3 block">
            {metricas.conversasEmAndamento} em atendimento
          </span>
        </div>

        {/* Coluna 2: Leads Qualificados */}
        <Link
          href="/clientes"
          className="p-4 space-y-1 block hover:bg-sup2 transition-colors cursor-pointer group"
        >
          <span className="text-[12px] font-medium text-texto2 block">
            Leads Qualificados
          </span>
          <span className="text-[28px] font-semibold font-mono tabular-nums text-texto block leading-none">
            {leadsQualificados}
          </span>
          <span className="text-[12px] text-texto3 block">
            {metricas.leadsQuentes} quentes · {metricas.leadsMornos} mornos
          </span>
        </Link>

        {/* Coluna 3: Aguardando Consultor */}
        <Link
          href="/fila"
          className={`p-4 space-y-1 block transition-colors cursor-pointer group ${
            metricas.aguardandoConsultor > 0
              ? "bg-atencao/5 hover:bg-atencao/10"
              : "hover:bg-sup2"
          }`}
        >
          <span className="text-[12px] font-medium text-texto2 block">
            Aguardando Consultor
          </span>
          <span
            className={`text-[28px] font-semibold font-mono tabular-nums block leading-none ${
              metricas.aguardandoConsultor > 0 ? "text-atencao" : "text-texto"
            }`}
          >
            {metricas.aguardandoConsultor}
          </span>
          <span className="text-[12px] text-texto3 block">
            {metricas.aguardandoConsultor > 0
              ? "Simulação pendente"
              : "Nenhuma pendência"}
          </span>
        </Link>

        {/* Coluna 4: Follow-ups */}
        <Link
          href="/followups"
          className="p-4 space-y-1 block hover:bg-sup2 transition-colors cursor-pointer group"
        >
          <span className="text-[12px] font-medium text-texto2 block">
            Follow-ups
          </span>
          <span
            className={`text-[28px] font-semibold font-mono tabular-nums block leading-none ${
              metricas.followupsPendentes > 0 ? "text-atencao" : "text-texto"
            }`}
          >
            {metricas.followupsPendentes}
          </span>
          <span className="text-[12px] text-texto3 block">
            {metricas.followupsPendentes > 0
              ? "Sugestões para aprovar"
              : "Nenhuma pendência"}
          </span>
        </Link>
      </div>

      {/* 3. Estrutura em Duas Colunas Livro-Caixa */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Termômetro SPIN & Tráfego (7 Colunas) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Termômetro Comercial em Lista / Livro-Caixa */}
          <div className="border border-fio rounded-[6px] bg-sup p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-fio">
              <div>
                <h2 className="text-[14px] font-semibold text-texto tracking-tight">
                  Termômetro Comercial (SPIN Selling)
                </h2>
                <p className="text-[12px] text-texto2">
                  Classificação da prontidão de contratação dos contatos.
                </p>
              </div>
              <Link
                href="/clientes"
                className="text-[12px] text-texto2 hover:text-texto flex items-center gap-1 font-medium"
              >
                Base de contatos
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Barra Fina Proporcional de Uma Cor Só ou Neutra */}
            <div className="space-y-2">
              {totalClassificados > 0 ? (
                <div className="h-1.5 w-full rounded-[2px] bg-sup2 overflow-hidden flex">
                  {metricas.leadsQuentes > 0 && (
                    <div
                      style={{
                        width: `${((metricas.leadsQuentes / totalClassificados) * 100).toFixed(1)}%`,
                      }}
                      className="h-full bg-quente"
                      title={`Quentes: ${metricas.leadsQuentes}`}
                    />
                  )}
                  {metricas.leadsMornos > 0 && (
                    <div
                      style={{
                        width: `${((metricas.leadsMornos / totalClassificados) * 100).toFixed(1)}%`,
                      }}
                      className="h-full bg-morno"
                      title={`Mornos: ${metricas.leadsMornos}`}
                    />
                  )}
                  {metricas.leadsFrios > 0 && (
                    <div
                      style={{
                        width: `${((metricas.leadsFrios / totalClassificados) * 100).toFixed(1)}%`,
                      }}
                      className="h-full bg-frio"
                      title={`Frios: ${metricas.leadsFrios}`}
                    />
                  )}
                </div>
              ) : (
                <div className="h-1.5 w-full rounded-[2px] bg-sup2" />
              )}

              {totalClassificados === 0 && (
                <p className="text-[12px] text-texto3">
                  Nenhum lead qualificado ainda. A classificação SPIN é gerada durante a conversa.
                </p>
              )}
            </div>

            {/* Tabela Livro-Caixa dos 3 Níveis */}
            <div className="border border-fio rounded-[6px] overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-sup2 text-texto2 font-medium border-b border-fio">
                  <tr>
                    <th className="py-2 px-3 font-normal">Classificação</th>
                    <th className="py-2 px-3 font-normal">Critério Operacional</th>
                    <th className="py-2 px-3 font-normal text-right">Contatos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fio">
                  <tr>
                    <td className="py-2.5 px-3 text-texto font-medium flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-quente" />
                      Leads Quentes
                    </td>
                    <td className="py-2.5 px-3 text-texto2">
                      Margem confirmada ou documento enviado
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right num font-semibold text-texto">
                      {metricas.leadsQuentes}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-texto font-medium flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-morno" />
                      Leads Mornos
                    </td>
                    <td className="py-2.5 px-3 text-texto2">
                      Em validação de convênio e requisitos
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right num font-semibold text-texto">
                      {metricas.leadsMornos}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 text-texto font-medium flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-frio" />
                      Leads Frios
                    </td>
                    <td className="py-2.5 px-3 text-texto2">
                      Primeiro contato ou dúvida genérica
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right num font-semibold text-texto">
                      {metricas.leadsFrios}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tráfego de Atendimento */}
          <div className="border border-fio rounded-[6px] bg-sup p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-fio">
              <div>
                <h2 className="text-[14px] font-semibold text-texto tracking-tight">
                  Tráfego de Mensagens
                </h2>
                <p className="text-[12px] text-texto2">
                  Registro de volume recebido e respostas enviadas.
                </p>
              </div>
            </div>

            <GraficoTrafego
              totalRecebidas={metricas.mensagensRecebidas}
              totalEnviadas={metricas.mensagensEnviadas}
            />
          </div>
        </div>

        {/* Coluna Direita: Estado da Operação & Serviços (5 Colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-fio rounded-[6px] bg-sup p-4 space-y-3">
            <h2 className="text-[14px] font-semibold text-texto tracking-tight pb-2 border-b border-fio">
              Conexões e Serviços
            </h2>

            <div className="divide-y divide-fio text-[12px]">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-texto2">WhatsApp Evolution v2</span>
                {metricas.conexoesAtivas > 0 ? (
                  <span className="flex items-center gap-1.5 font-medium text-texto">
                    <span className="h-1.5 w-1.5 rounded-full bg-jade" />
                    Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-erro">
                    <span className="h-1.5 w-1.5 rounded-full bg-erro" />
                    Offline
                  </span>
                )}
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-texto2">Fila de Simulação</span>
                <span className="font-mono text-texto font-medium">
                  {metricas.aguardandoConsultor > 0
                    ? `${metricas.aguardandoConsultor} casos aguardando`
                    : "Zero pendências"}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-texto2">Follow-ups Supervisionados</span>
                <span className="font-mono text-texto font-medium">
                  {metricas.followupsPendentes > 0
                    ? `${metricas.followupsPendentes} para aprovação`
                    : "Em dia"}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-texto2">Total de Conversas no CRM</span>
                <span className="font-mono text-texto font-medium">
                  {metricas.totalConversas} contatos
                </span>
              </div>
            </div>
          </div>

          {/* Nota de Governança Institucional Sóbria */}
          <div className="border border-fio rounded-[6px] bg-sup p-3 text-[12px] text-texto2 leading-relaxed">
            <span className="font-medium text-texto block mb-0.5">
              Governança Operacional
            </span>
            Toda simulação com valores, taxas ou parcelas exige validação pelo consultor antes do disparo ao cliente.
          </div>
        </div>
      </div>
    </div>
  );
}
