"use client";

import { useActionState } from "react";
import {
  pedirDesconexao,
  alternarConexaoAtiva,
  apagarConexao,
  pedirImportacao,
  type Resultado,
} from "@/lib/acoes-painel";
import type { Conexao } from "@/lib/dados";
import { cn } from "@/lib/cn";

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
  const [imp, importar, importando] = useActionState(
    pedirImportacao,
    {} as Resultado
  );

  const erro = desc.erro ?? pausa.erro ?? rem.erro ?? imp.erro;
  const pedidoEmCurso = conexao.desconectando || desc.ok;

  /*
    O progresso vem do banco, escrito pelo motor — não do estado da tela.
    Antes o botão dizia "Importando…" só porque o clique tinha ido, o que é
    diferente de estar importando de verdade.
  */
  const rodando =
    conexao.importarDias > 0 || conexao.importarTotal !== null || imp.ok;

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

      {conexao.estado === "conectado" && conexao.ativa && !pedidoEmCurso ? (
        <div className="mt-4 border-t border-fio pt-4">
          {rodando ? (
            <ProgressoDaImportacao
              feitas={conexao.importarFeitas}
              total={conexao.importarTotal}
              pedido={conexao.importarDias > 0}
            />
          ) : (
            <form action={importar}>
              <input type="hidden" name="id" value={conexao.id} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-texto2">
                  Trazer conversas que já estavam no WhatsApp:
                </span>
                <select
                  name="dias"
                  defaultValue="7"
                  aria-label="Período a importar"
                  className="h-7 rounded-md border border-fio bg-sup px-2 text-[12px] text-texto focus:border-jade focus:outline-none"
                >
                  <option value="2">últimos 2 dias</option>
                  <option value="7">últimos 7 dias</option>
                  <option value="30">últimos 30 dias</option>
                  <option value="90">últimos 90 dias</option>
                </select>
                <select
                  name="filtro"
                  defaultValue="todas"
                  aria-label="Quais conversas importar"
                  className="h-7 rounded-md border border-fio bg-sup px-2 text-[12px] text-texto focus:border-jade focus:outline-none"
                >
                  <option value="todas">todas</option>
                  <option value="sem_resposta">só as não lidas</option>
                </select>
                <button
                  type="submit"
                  disabled={importando}
                  className="h-7 rounded-md border border-fio bg-sup px-2.5 text-[12px] text-texto transition-colors hover:border-fio-forte disabled:opacity-45"
                >
                  {importando ? "Pedindo…" : "Importar"}
                </button>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-texto3">
                Só organiza o que já aconteceu — não responde ninguém e não dispara
                cobrança. As conversas entram como &quot;Novo&quot; pra você decidir.
                &quot;Não lidas&quot; traz só quem tem a bolinha verde no seu celular.
              </p>
            </form>
          )}
        </div>
      ) : null}

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

function ProgressoDaImportacao({
  feitas,
  total,
  pedido,
}: {
  feitas: number;
  total: number | null;
  pedido: boolean;
}) {
  // Sem total ainda: o motor está lendo a lista de conversas do WhatsApp.
  if (total === null) {
    return (
      <p className="text-[12px] text-texto2">
        {pedido
          ? "Pedido registrado. O motor começa em até 30 segundos…"
          : "Lendo suas conversas no WhatsApp…"}
      </p>
    );
  }

  const parte = total > 0 ? Math.round((feitas / total) * 100) : 0;

  return (
    <div>
      <p className="text-[12px] text-texto2">
        Importando <span className="num text-texto">{feitas}</span> de{" "}
        <span className="num text-texto">{total}</span> conversas…
      </p>
      <div
        role="progressbar"
        aria-valuenow={parte}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-sup2"
      >
        <div
          className="h-full bg-jade transition-[width] duration-500"
          style={{ width: `${parte}%` }}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-texto3">
        Nada está sendo respondido. Pode fechar esta tela — ele continua.
      </p>
    </div>
  );
}
