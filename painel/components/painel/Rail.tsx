"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Item = { href: string; nome: string; contagem?: number };

export function Rail({
  abertas,
  rascunhos,
  motorLigado,
}: {
  abertas: number;
  rascunhos: number;
  motorLigado: boolean;
}) {
  const trabalho: Item[] = [
    { href: "/fila", nome: "Fila", contagem: abertas },
    { href: "/rascunhos", nome: "Rascunhos", contagem: rascunhos },
    { href: "/conversas", nome: "Conversas" },
    // Onde o consultor confere o que o agente fez sozinho. Fica no bloco de
    // trabalho, não em ajustes: em modo autônomo isso é rotina, não config.
    { href: "/atividade", nome: "Atividade" },
    { href: "/meu-jeito", nome: "Meu jeito" },
  ];

  const ajustes: Item[] = [
    { href: "/conexao", nome: "Conexão" },
    { href: "/conta", nome: "Conta" },
  ];

  return (
    <>
      {/* Desktop: coluna fixa a esquerda. */}
      <nav
        aria-label="Seções"
        className="hidden w-[212px] shrink-0 flex-col border-r border-fio py-3 md:flex"
      >
        <div className="flex flex-col gap-px px-2">
          {trabalho.map((item) => (
            <LinkDoRail key={item.href} item={item} />
          ))}
        </div>
        <div className="mx-4 my-3 h-px bg-fio" />
        <div className="flex flex-col gap-px px-2">
          {ajustes.map((item) => (
            <LinkDoRail
              key={item.href}
              item={item}
              ponto={item.href === "/conexao" ? motorLigado : undefined}
            />
          ))}
        </div>
      </nav>

      {/* Celular: faixa rolavel logo abaixo da barra de estado. */}
      <nav
        aria-label="Seções"
        className="flex gap-1 overflow-x-auto border-b border-fio px-3 py-2 md:hidden"
      >
        {[...trabalho, ...ajustes].map((item) => (
          <AbaDoCelular key={item.href} item={item} />
        ))}
      </nav>
    </>
  );
}

function LinkDoRail({ item, ponto }: { item: Item; ponto?: boolean }) {
  const caminho = usePathname();
  const ativo = caminho === item.href || caminho.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center justify-between rounded-md pl-3 pr-2.5 text-[13px]",
        "transition-colors duration-100",
        ativo ? "bg-sup text-texto" : "text-texto2 hover:bg-sup hover:text-texto"
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "h-3.5 w-[2px] rounded-full transition-colors",
            ativo ? "bg-jade" : "bg-transparent"
          )}
        />
        {item.nome}
      </span>

      {typeof item.contagem === "number" && item.contagem > 0 ? (
        <span
          className={cn(
            "num rounded-full px-1.5 py-0.5 text-[11px] leading-none",
            item.href === "/fila" ? "bg-jade text-jade-texto" : "bg-sup2 text-texto2"
          )}
        >
          {item.contagem}
        </span>
      ) : null}

      {typeof ponto === "boolean" ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", ponto ? "bg-jade" : "bg-texto3")}
        />
      ) : null}
    </Link>
  );
}

function AbaDoCelular({ item }: { item: Item }) {
  const caminho = usePathname();
  const ativo = caminho === item.href || caminho.startsWith(item.href + "/");

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap",
        ativo ? "bg-sup text-texto" : "text-texto2"
      )}
    >
      {item.nome}
      {typeof item.contagem === "number" && item.contagem > 0 ? (
        <span
          className={cn(
            "num rounded-full px-1.5 text-[11px] leading-[16px]",
            item.href === "/fila" ? "bg-jade text-jade-texto" : "bg-sup2 text-texto2"
          )}
        >
          {item.contagem}
        </span>
      ) : null}
    </Link>
  );
}
