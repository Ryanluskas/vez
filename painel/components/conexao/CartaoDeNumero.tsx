"use client";

import { useActionState } from "react";
import {
  pedirDesconexao,
  alternarConexaoAtiva,
  apagarConexao,
  type Resultado,
} from "@/lib/acoes-painel";
import type { Conexao } from "@/lib/dados";
import { cn } from "@/lib/cn";

const ROTULO = {
  desligado: "Desligado",
  iniciando: "Abrindo o WhatsApp",
  aguardando_qr: "Esperando você escanear",
  conectado: "Conectado e atendendo",
} as const;

const COR_DO_PONTO = {
  desligado: "bg-texto3",
  iniciando: "bg-morno",
  aguardando_qr: "bg-brasa",
  conectado: "bg-jade",
} as const;

export function CartaoDeNumero({ conexao }: { conexao: Conexao }) {
  const [desc, desconectar, desconectando] = useActionState(
    pedirDesconexao,
    {} as Resultado
  );
  const [pausa, alternarAtiva, pausando] = useActionState(
    alternarConexaoAtiva,
    {} as Resultado
  );
  const [rem, apagar, apagando] = useActionState(apagarConexao, {} as Resultado);

  const erro = desc.erro ?? pausa.erro ?? rem.erro;
  const pedidoEmCurso = conexao.desconectando || desc.ok;

  return (
    <article className="rounded-lg border border-fio bg-sup p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                conexao.ativa ? COR_DO_PONTO[conexao.estado] : "bg-texto3"
              )}
            />
            <span className="text-[15px] text-texto">{conexao.apelido}</span>
            {conexao.telefone ? (
              <span className="num text-[12px] text-texto3">{conexao.telefone}</span>
            ) : null}
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-texto2">
            {!conexao.ativa
              ? "Pausado. O bot não atende por este número."
              : pedidoEmCurso
                ? "Desconectando… o motor faz isso em até 30 segundos."
                : conexao.estado === "conectado"
                  ? `Toda mensagem que chegar neste número entra nas Conversas.${
                      conexao.aparelho ? ` Aparelho: ${conexao.aparelho}.` : ""
                    }`
                  : (conexao.detalhe ??
                    "Ligue o motor no seu computador e o QR aparece aqui.")}
          </p>

          {conexao.vistoEm && conexao.estado === "desligado" && conexao.ativa ? (
            <p className="mt-1.5 text-[12px] text-texto3">
              Última batida:{" "}
              {new Date(conexao.vistoEm).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {conexao.estado === "conectado" && conexao.ativa ? (
            <form action={desconectar}>
              <input type="hidden" name="id" value={conexao.id} />
              <button
                type="submit"
                disabled={desconectando || pedidoEmCurso}
                title="Remove este aparelho do seu WhatsApp. Depois é só escanear um QR novo."
                className="rounded-md px-2 py-1 text-[11px] text-texto3 transition-colors hover:text-erro disabled:opacity-45"
              >
                {desconectando || pedidoEmCurso ? "Desconectando…" : "Desconectar"}
              </button>
            </form>
          ) : null}

          <form action={alternarAtiva}>
            <input type="hidden" name="id" value={conexao.id} />
            <input type="hidden" name="ativa" value={conexao.ativa ? "false" : "true"} />
            <button
              type="submit"
              disabled={pausando}
              title={
                conexao.ativa
                  ? "Para de atender por este número e libera a memória que ele usa."
                  : "Volta a atender por este número."
              }
              className={cn(
                "rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-45",
                conexao.ativa ? "text-texto3 hover:text-texto" : "text-jade"
              )}
            >
              {conexao.ativa ? "Pausar" : "Retomar"}
            </button>
          </form>

          {!conexao.ativa ? (
            <form action={apagar}>
              <input type="hidden" name="id" value={conexao.id} />
              <button
                type="submit"
                disabled={apagando}
                title="Tira o número da lista. As conversas dele continuam guardadas."
                className="rounded-md px-2 py-1 text-[11px] text-texto3 transition-colors hover:text-erro disabled:opacity-45"
              >
                Apagar
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {conexao.qr && conexao.ativa && !pedidoEmCurso ? (
        <div className="mt-4 flex flex-col items-center border-t border-fio pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL do banco */}
          <img
            src={conexao.qr}
            alt={`Código QR para conectar ${conexao.apelido}`}
            width={220}
            height={220}
            className="rounded-md"
          />
          <p className="mt-3 max-w-xs text-center text-[13px] leading-relaxed text-texto2">
            No celular do número <span className="text-texto">{conexao.apelido}</span>:
            WhatsApp → Aparelhos conectados → Conectar um aparelho.
          </p>
          <p className="mt-1.5 text-[12px] text-texto3">
            O código troca sozinho a cada poucos segundos.
          </p>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="mt-3 text-[12px] text-erro">
          {erro}
        </p>
      ) : null}
    </article>
  );
}
