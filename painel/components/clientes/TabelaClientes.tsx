"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  MessageSquare,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { AppleSearchInput } from "@/components/ui/apple/AppleSearchInput";
import type { Conversa } from "@/lib/tipos";

interface TabelaClientesProps {
  clientes: Conversa[];
}

export function TabelaClientes({ clientes }: TabelaClientesProps) {
  const [busca, setBusca] = useState("");
  const [filtroTemp, setFiltroTemp] = useState<string>("todas");

  const clientesFiltrados = clientes.filter((c) => {
    const termo = busca.toLowerCase();
    const bateTexto =
      !busca ||
      (c.nome && c.nome.toLowerCase().includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.ultima_mensagem && c.ultima_mensagem.toLowerCase().includes(termo));

    if (!bateTexto) return false;

    if (filtroTemp !== "todas" && c.qualificacao !== filtroTemp) return false;

    return true;
  });

  return (
    <div className="space-y-6 select-none">
      {/* Controles de Busca e Filtros Apple */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <AppleSearchInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, telefone..."
            onClear={() => setBusca("")}
          />
        </div>

        {/* Filtros em Pílulas */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "todas", label: "Todos os Leads" },
            { id: "quente", label: "Quentes 🔥" },
            { id: "morna", label: "Mornos ⚡" },
            { id: "fria", label: "Frios ❄️" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroTemp(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all whitespace-nowrap cursor-pointer",
                filtroTemp === f.id
                  ? "bg-sup text-texto shadow-sm border border-fio"
                  : "text-texto3 hover:text-texto hover:bg-sup2"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista / Tabela Inset Grouped Apple */}
      <div className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl overflow-hidden divide-y divide-fio/40">
        {clientesFiltrados.length === 0 ? (
          <div className="p-12 text-center text-texto3 space-y-2">
            <Users className="h-8 w-8 mx-auto stroke-[1.5]" />
            <p className="text-[14px] text-texto font-medium">Nenhum cliente encontrado</p>
            <p className="text-[12px]">Tente mudar os filtros de busca acima.</p>
          </div>
        ) : (
          clientesFiltrados.map((cliente) => {
            const nomeOuNumero = cliente.nome || cliente.telefone;
            const inicial = (nomeOuNumero[0] || "?").toUpperCase();

            return (
              <div
                key={cliente.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-sup2/40 transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "h-11 w-11 rounded-2xl flex items-center justify-center font-display font-semibold text-[15px] shrink-0 border border-fio",
                      cliente.qualificacao === "quente"
                        ? "bg-erro-fundo text-erro border-erro/30"
                        : "bg-sup2 text-texto"
                    )}
                  >
                    {inicial}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[15px] font-semibold text-texto tracking-tight">
                        {nomeOuNumero}
                      </span>
                      {cliente.qualificacao === "quente" && (
                        <AppleBadge variant="destructive">Lead Quente</AppleBadge>
                      )}
                      {cliente.so_voce && (
                        <AppleBadge variant="info">Atendimento Humano</AppleBadge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[12px] text-texto3">
                      <span className="font-mono flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {cliente.telefone}
                      </span>
                      <span>·</span>
                      <span>
                        Última atividade:{" "}
                        {new Date(cliente.atualizado_em).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Badges e Ação Rápida */}
                <div className="flex items-center gap-3 justify-between sm:justify-end">
                  <div className="flex items-center gap-2">
                    <AppleBadge variant="outline">
                      {cliente.etapa ? cliente.etapa.replace(/_/g, " ") : "Em contato"}
                    </AppleBadge>

                    {cliente.estagio === "aguardando_voce" ? (
                      <AppleBadge variant="warning" dot>
                        Aguardando Você
                      </AppleBadge>
                    ) : (
                      <AppleBadge variant="success" dot>
                        Vez Ativo
                      </AppleBadge>
                    )}
                  </div>

                  <Link href={`/conversas?id=${cliente.id}`}>
                    <AppleButton
                      size="sm"
                      variant="secondary"
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                    >
                      Abrir Chat
                    </AppleButton>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
