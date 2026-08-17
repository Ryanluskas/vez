"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Responder } from "./Responder";
import type { Atalho } from "@/lib/tipos";
import {
  COR_DA_BORDA,
  COR_DO_TEXTO,
  formatarEspera,
  temperaturaDaEspera,
} from "./espera";

export type ItemDaFilaProps = {
  id: string;
  criadoEm: string;
  /* Instante do servidor no momento da renderizacao: mantem o primeiro
     paint identico no servidor e no cliente, sem piscar. */
  agoraServidor: string;
  nome: string;
  telefone: string;
  pergunta: string;
  contexto: string | null;
  /* Por que essa conversa congelou, em portugues. */
  motivo: string | null;
  /* Que informacao o bot esta pedindo: valor, prazo, documentos… */
  categoria: string | null;
  atalhos: Atalho[];
};

/*
  O que o bot precisa de voce, em uma palavra. E a diferenca entre abrir a
  Fila e ver dez perguntas iguais, ou ver que tres sao de valor e uma e de
  prazo — e responder as tres de valor de uma vez.
*/
const ROTULO_DA_CATEGORIA: Record<string, string> = {
  valor: "valor",
  prazo: "prazo",
  documentos: "documentos",
  status: "status",
  saudacao: "conversa",
  horario: "horario",
  outro: "outro",
};

export function ItemDaFila({
  id,
  criadoEm,
  agoraServidor,
  nome,
  telefone,
  pergunta,
  contexto,
  motivo,
  categoria,
  atalhos,
}: ItemDaFilaProps) {
  const inicio = new Date(criadoEm).getTime();
  const [esperaMs, setEsperaMs] = useState(
    () => new Date(agoraServidor).getTime() - inicio
  );

  useEffect(() => {
    const marcar = () => setEsperaMs(Date.now() - inicio);
    marcar();
    const relogio = setInterval(marcar, 1000);
    return () => clearInterval(relogio);
  }, [inicio]);

  const temperatura = temperaturaDaEspera(esperaMs);

  return (
    <article className="relative border-t border-fio py-3.5 pl-4 pr-1">
      {/* A barra de temperatura. Bordas retas de proposito: ela e uma regua,
          nao um cartao. */}
      <span
        aria-hidden="true"
        className={cn("absolute left-0 top-0 h-full w-[2px]", COR_DA_BORDA[temperatura])}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <time
          dateTime={criadoEm}
          className={cn("num text-[13px]", COR_DO_TEXTO[temperatura])}
          title={`Chegou às ${new Date(criadoEm).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}`}
        >
          {formatarEspera(esperaMs)}
        </time>
        <span className="text-[14px] text-texto">{nome}</span>
        <span className="num text-[12px] text-texto3">{telefone}</span>

        {/* O que ele precisa de voce. Le-se antes da pergunta: o consultor
            decide em qual item mexer olhando isto. */}
        {categoria ? (
          <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-texto2">
            {ROTULO_DA_CATEGORIA[categoria] ?? categoria}
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[14px] leading-relaxed text-texto">{pergunta}</p>

      {motivo ? (
        <p className="mt-1 text-[11px] text-texto3">Travou porque {motivo}.</p>
      ) : null}

      {contexto ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-[12px] text-texto2 transition-colors hover:text-texto">
            <span className="group-open:hidden">Ver as últimas mensagens</span>
            <span className="hidden group-open:inline">Esconder</span>
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-fio bg-sup px-3 py-2.5 font-sans text-[13px] leading-relaxed text-texto2">
            {contexto}
          </pre>
        </details>
      ) : null}

      <Responder idPendencia={id} atalhos={atalhos} />
    </article>
  );
}
