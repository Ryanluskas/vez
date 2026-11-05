"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Clock,
  Users,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

export function MobileBottomBar({
  abertas = 0,
  followups = 0,
}: {
  abertas?: number;
  followups?: number;
}) {
  const pathname = usePathname();

  const tabs = [
    {
      href: "/visao-geral",
      label: "Início",
      icon: LayoutDashboard,
    },
    {
      href: "/conversas",
      label: "Chat",
      icon: MessageSquare,
    },
    {
      href: "/fila",
      label: "Fila",
      icon: Clock,
      badge: abertas > 0 ? abertas : undefined,
    },
    {
      href: "/clientes",
      label: "Clientes",
      icon: Users,
    },
    {
      href: "/followups",
      label: "Follow-up",
      icon: Sparkles,
      badge: followups > 0 ? followups : undefined,
    },
    {
      href: "/configuracoes",
      label: "Ajustes",
      icon: Settings,
    },
  ];

  return (
    <nav
      aria-label="Navegação móvel"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-fio bg-sup/90 backdrop-blur-xl px-2 py-1 safe-bottom md:hidden shadow-lg"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/visao-geral" && pathname.startsWith(tab.href));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-150 min-w-[54px]",
              isActive ? "text-jade font-medium" : "text-texto3 hover:text-texto"
            )}
          >
            <div className="relative">
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.3 : 1.8} />
              {tab.badge !== undefined && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-erro px-1 text-[10px] font-bold text-white shadow-sm">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </div>
            <span className="mt-0.5 text-[10px] tracking-tight">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
