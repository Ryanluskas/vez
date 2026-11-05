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
import {
  Smartphone,
  Power,
  Pause,
  Play,
  Trash2,
  DownloadCloud,
} from "lucide-react";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { AppleButton } from "@/components/ui/apple/AppleButton";

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

  const rodando =
    conexao.importarDias > 0 || conexao.importarTotal !== null || imp.ok;

  const nomeInstancia =
    conexao.evolutionInstancia ||
    `vez_${String(conexao.id).replace(/-/g, "").slice(0, 10)}`;

  return (
    <div className="rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl p-5 sm:p-6 transition-all hover:border-fio-forte">
      {/* Header do Cartão de Instância */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-2xl bg-sup2 border border-fio text-jade shrink-0">
            <Smartphone className="h-6 w-6" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-display text-[17px] font-semibold text-texto tracking-tight">
                {conexao.apelido}
              </h3>

              {conexao.telefone && (
                <span className="font-mono text-[13px] text-texto2">
                  {conexao.telefone}
                </span>
              )}

              <AppleBadge
                variant={
                  !conexao.ativa
                    ? "default"
                    : conexao.estado === "conectado"
                    ? "success"
                    : conexao.estado === "aguardando_qr"
                    ? "warning"
                    : "destructive"
                }
                dot
              >
                {!conexao.ativa
                  ? "Instância Pausada"
                  : conexao.estado === "conectado"
                  ? "Conectado"
                  : conexao.estado === "aguardando_qr"
                  ? "Aguardando Leitura de QR"
                  : "Desconectado"}
              </AppleBadge>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sup2 border border-fio text-texto3">
                Evolution v2 · Baileys
              </span>
            </div>

            <div className="mt-1 flex items-center gap-3 text-[12px] text-texto3 flex-wrap">
              <span>
                Instância: <code className="font-mono text-texto2">{nomeInstancia}</code>
              </span>
              <span>·</span>
              <span>
                {conexao.aparelho
                  ? `Aparelho: ${conexao.aparelho}`
                  : "Gateway desacoplado na porta 8080"}
              </span>
            </div>
          </div>
        </div>

        {/* Ações Rápidas de Gerenciamento */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <form action={alternarAtiva}>
            <input type="hidden" name="id" value={conexao.id} />
            <input
              type="hidden"
              name="ativa"
              value={conexao.ativa ? "false" : "true"}
            />
            <AppleButton
              size="sm"
              variant="secondary"
              disabled={pausando}
              icon={
                conexao.ativa ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-jade" />
                )
              }
            >
              {conexao.ativa ? "Pausar" : "Retomar"}
            </AppleButton>
          </form>

          {conexao.estado === "conectado" && conexao.ativa && (
            <form action={desconectar}>
              <input type="hidden" name="id" value={conexao.id} />
              <AppleButton
                size="sm"
                variant="destructive"
                disabled={desconectando || pedidoEmCurso}
                icon={<Power className="h-3.5 w-3.5" />}
              >
                {desconectando || pedidoEmCurso ? "Desconectando…" : "Desconectar"}
              </AppleButton>
            </form>
          )}

          {!conexao.ativa && (
            <form action={apagar}>
              <input type="hidden" name="id" value={conexao.id} />
              <AppleButton
                size="sm"
                variant="destructive"
                disabled={apagando}
                icon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Apagar
              </AppleButton>
            </form>
          )}
        </div>
      </div>

      {/* Exibição Elegante de QR Code Apple */}
      {conexao.qr && conexao.ativa && !pedidoEmCurso && (
        <div className="mt-6 flex flex-col items-center justify-center p-6 rounded-2xl bg-sup2/50 border border-fio space-y-4">
          <div className="p-3 bg-white rounded-2xl shadow-md border border-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={conexao.qr}
              alt={`Código QR para conectar ${conexao.apelido}`}
              width={220}
              height={220}
              className="rounded-xl"
            />
          </div>

          <div className="text-center space-y-1 max-w-sm">
            <p className="text-[14px] font-semibold text-texto tracking-tight">
              Escaneie com o WhatsApp Business
            </p>
            <p className="text-[12px] text-texto2 leading-relaxed">
              Abra o WhatsApp no aparelho → <strong>Aparelhos Conectados</strong> →{" "}
              <strong>Conectar um aparelho</strong> e aponte a câmera para o QR.
            </p>
            <p className="text-[11px] text-texto3 font-mono">
              Atualização automática e segura via Evolution API.
            </p>
          </div>
        </div>
      )}

      {/* Bloco de Importação Histórica */}
      {conexao.estado === "conectado" && conexao.ativa && !pedidoEmCurso && (
        <div className="mt-5 border-t border-fio/60 pt-4">
          {rodando ? (
            <ProgressoDaImportacao
              feitas={conexao.importarFeitas}
              total={conexao.importarTotal}
              pedido={conexao.importarDias > 0}
            />
          ) : (
            <form action={importar} className="space-y-3">
              <input type="hidden" name="id" value={conexao.id} />
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[13px] font-medium text-texto flex items-center gap-1.5">
                  <DownloadCloud className="h-4 w-4 text-jade" />
                  Sincronizar Histórico:
                </span>

                <select
                  name="dias"
                  defaultValue="7"
                  className="h-8 rounded-xl border border-fio bg-sup px-3 text-[12px] text-texto focus:border-jade focus:outline-none"
                >
                  <option value="2">Últimos 2 dias</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                </select>

                <select
                  name="filtro"
                  defaultValue="todas"
                  className="h-8 rounded-xl border border-fio bg-sup px-3 text-[12px] text-texto focus:border-jade focus:outline-none"
                >
                  <option value="todas">Todas as conversas</option>
                  <option value="sem_resposta">Apenas não respondidas</option>
                </select>

                <AppleButton
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={importando}
                >
                  {importando ? "Sincronizando…" : "Importar Conversas"}
                </AppleButton>
              </div>
            </form>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-3 text-[12px] text-erro font-medium">
          {erro}
        </p>
      )}
    </div>
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
  if (total === null) {
    return (
      <p className="text-[12px] text-texto2">
        {pedido
          ? "Pedido registrado. O motor começa a sincronizar em instantes…"
          : "Lendo histórico na Evolution API…"}
      </p>
    );
  }

  const parte = total > 0 ? Math.round((feitas / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[12px]">
        <span className="text-texto2">
          Importando <span className="font-mono text-texto">{feitas}</span> de{" "}
          <span className="font-mono text-texto">{total}</span> conversas…
        </span>
        <span className="font-mono font-medium text-jade">{parte}%</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-sup2 border border-fio">
        <div
          className="h-full bg-jade transition-all duration-300 rounded-full"
          style={{ width: `${parte}%` }}
        />
      </div>
    </div>
  );
}
