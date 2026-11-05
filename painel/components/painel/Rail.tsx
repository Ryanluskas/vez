"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Clock,
  Users,
  RotateCcw,
  FileEdit,
  Smartphone,
  Cpu,
  Activity,
  Sliders,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

type ItemNav = {
  href: string;
  nome: string;
  icone: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  contagem?: number;
};

export function Rail({
  abertas,
  rascunhos,
  followups = 0,
  motorLigado,
}: {
  abertas: number;
  rascunhos: number;
  followups?: number;
  motorLigado: boolean;
}) {
  const operacao: ItemNav[] = [
    { href: "/visao-geral", nome: "Visão Geral", icone: LayoutDashboard },
    { href: "/conversas", nome: "Atendimento", icone: MessageSquare },
    { href: "/fila", nome: "Fila de Triage", icone: Clock, contagem: abertas },
    { href: "/clientes", nome: "CRM & Clientes", icone: Users },
    { href: "/followups", nome: "Follow-ups", icone: RotateCcw, contagem: followups },
    { href: "/rascunhos", nome: "Rascunhos", icone: FileEdit, contagem: rascunhos },
  ];

  const plataforma: ItemNav[] = [
    { href: "/conexao", nome: "WhatsApp Evolution", icone: Smartphone },
    { href: "/ia", nome: "Modelos IA", icone: Cpu },
    { href: "/atividade", nome: "Auditoria & Logs", icone: Activity },
    { href: "/meu-jeito", nome: "Playbook CapitalCred", icone: Sliders },
    { href: "/configuracoes", nome: "Ajustes", icone: Settings },
  ];

  return (
    <nav
      aria-label="Menu principal"
      className="hidden w-[220px] shrink-0 flex-col justify-between border-r border-fio bg-sup p-3 md:flex select-none"
    >
      <div className="flex flex-col gap-5">
        <div>
          <span className="px-2.5 text-[11px] font-mono uppercase tracking-wider text-texto3 font-medium">
            Operação
          </span>
          <div className="mt-1 flex flex-col gap-0.5">
            {operacao.map((item) => (
              <LinkDoRail key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <span className="px-2.5 text-[11px] font-mono uppercase tracking-wider text-texto3 font-medium">
            Plataforma
          </span>
          <div className="mt-1 flex flex-col gap-0.5">
            {plataforma.map((item) => (
              <LinkDoRail key={item.href} item={item} />
            ))}
          </div>
        </div>
      </div>

      {/* Rodapé — Estado do Sistema */}
      <div className="mt-auto pt-3 border-t border-fio">
        <Link
          href="/conexao"
          className="flex items-center justify-between p-2 rounded-[6px] hover:bg-sup2 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                motorLigado ? "bg-jade" : "bg-erro"
              )}
            />
            <div className="flex flex-col">
              <span className="text-[12px] font-medium text-texto leading-none">
                Sistema
              </span>
              <span className="text-[11px] text-texto2 mt-0.5 leading-none">
                {motorLigado ? "Operacional" : "Desconectado"}
              </span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-texto3">v0.2</span>
        </Link>
      </div>
    </nav>
  );
}

function LinkDoRail({ item }: { item: ItemNav }) {
  const caminho = usePathname();
  const ativo =
    caminho === item.href ||
    (item.href !== "/visao-geral" && caminho.startsWith(item.href + "/"));
  const Icone = item.icone;

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center justify-between px-2.5 text-[13px] font-medium transition-colors cursor-pointer rounded-[4px]",
        ativo
          ? "bg-sup2 text-texto font-semibold border-l-2 border-jade rounded-l-none pl-2"
          : "text-texto2 hover:bg-sup2 hover:text-texto"
      )}
    >
      <div className="flex items-center gap-2">
        <Icone
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-colors",
            ativo ? "text-texto" : "text-texto3 group-hover:text-texto2"
          )}
          strokeWidth={1.75}
        />
        <span className="tracking-tight">{item.nome}</span>
      </div>

      {item.contagem !== undefined && item.contagem > 0 && (
        <span className="font-mono text-[11px] font-semibold text-texto2">
          {item.contagem}
        </span>
      )}
    </Link>
  );
}
