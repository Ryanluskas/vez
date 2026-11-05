"use client";

import { useActionState, useRef, useState } from "react";
import { responderPendencia, type Resultado } from "@/lib/acoes-painel";
import type { Atalho } from "@/lib/tipos";
import { cn } from "@/lib/cn";
import { calcularReducaoCapitalCred } from "@/lib/calculadora";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Calculator,
  Edit3,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

export function Responder({
  idPendencia,
  atalhos,
  categoria,
  nomeCliente,
  perguntaCliente,
}: {
  idPendencia: string;
  atalhos: Atalho[];
  categoria?: string | null;
  nomeCliente?: string | null;
  perguntaCliente?: string | null;
}) {
  const [estado, enviar, pendente] = useActionState(
    responderPendencia,
    {} as Resultado
  );

  const [modo, setModo] = useState<"simulador" | "livre">(() =>
    categoria === "valor" || (perguntaCliente && /libera|simula|valor/i.test(perguntaCliente))
      ? "simulador"
      : "livre"
  );

  const [valorTotalBruto, setValorTotalBruto] = useState<string>("");
  const campoLivre = useRef<HTMLInputElement>(null);
  const campoOculto = useRef<HTMLInputElement>(null);

  const primeiroNome = nomeCliente ? nomeCliente.trim().split(/\s+/)[0] : "";

  const calculo = calcularReducaoCapitalCred(valorTotalBruto);

  const propostaOficial = calculo
    ? `${primeiroNome ? `${primeiroNome}, ` : ""}rodei sua simulação aqui no sistema. Conseguimos derrubar sua taxa de 2,x% para 1,40% ao mês pelo Santander, atualizando o prazo para 120 meses sem subir um centavo na sua parcela atual. Com essa redução, libera ${calculo.valorClienteFormatado} líquido na sua conta hoje. Ficou bom pra você? Quer seguir com essa liberação?`
    : "";

  function usarAtalho(texto: string) {
    if (modo === "livre") {
      const alvo = campoLivre.current;
      if (!alvo) return;
      alvo.value = texto;
      alvo.focus();
      alvo.setSelectionRange(texto.length, texto.length);
    } else {
      setValorTotalBruto(texto);
    }
  }

  if (estado.ok) {
    return (
      <div className="flex items-center gap-2 p-3.5 rounded-xl bg-jade-fundo border border-jade/30 text-jade text-[13px] font-medium animate-in fade-in">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Resposta registrada com sucesso. A proposta está pronta e aguardando conferência na aba <strong>Rascunhos</strong>.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Abas Superiores de Modo: Simulador CapitalCred vs Digitação Livre */}
      <div className="flex items-center justify-between gap-2 border-b border-fio/60 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setModo("simulador")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer",
              modo === "simulador"
                ? "bg-jade/10 text-jade border border-jade/30 shadow-xs"
                : "text-texto3 hover:text-texto2 hover:bg-sup2"
            )}
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>Simulador Santander (CapitalCred)</span>
            {categoria === "valor" && (
              <span className="h-1.5 w-1.5 rounded-full bg-jade animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setModo("livre")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer",
              modo === "livre"
                ? "bg-sup2 text-texto border border-fio-forte shadow-xs"
                : "text-texto3 hover:text-texto2 hover:bg-sup2"
            )}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Digitação Livre / Outros Bancos</span>
          </button>
        </div>

        <span className="text-[11px] font-mono text-texto3 hidden sm:inline-block">
          Taxa oficial: 1,40% · Prazo: 120m
        </span>
      </div>

      {modo === "simulador" ? (
        /* MODO SIMULADOR CAPITALCRED */
        <form action={enviar} className="space-y-3.5">
          <input type="hidden" name="id" value={idPendencia} />
          <input
            type="hidden"
            name="resposta"
            ref={campoOculto}
            value={propostaOficial || valorTotalBruto}
          />

          {/* Atalhos rápidos de valores frequentes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-texto3 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-jade" />
                Valores Frequentes de Redução Santander
              </span>
              <span className="text-[11px] text-texto3 font-mono">
                &lt; R$ 8k = 62/38 · &ge; R$ 8k = 50/50
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[4200, 6500, 7600, 8500, 12000, 16000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValorTotalBruto(String(v))}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[12px] font-mono transition-all cursor-pointer",
                    valorTotalBruto === String(v)
                      ? "border-jade bg-jade/10 text-jade font-semibold ring-1 ring-jade/30"
                      : "border-fio bg-sup2/60 text-texto2 hover:border-fio-forte hover:text-texto"
                  )}
                >
                  R$ {v.toLocaleString("pt-BR")}
                </button>
              ))}
            </div>
          </div>

          {/* Campo Principal: Quanto libera no total no Santander? */}
          <div className="rounded-xl border border-fio bg-sup p-3.5 space-y-3">
            <div>
              <label
                htmlFor="input-valor-total"
                className="block text-[13px] font-semibold text-texto tracking-tight"
              >
                Quanto libera no total no Santander?
              </label>
              <p className="text-[11px] text-texto3 mt-0.5">
                Digite o valor bruto apurado no sistema do banco Santander. O cálculo de divisão comercial é aplicado automaticamente.
              </p>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] font-semibold text-texto3 select-none">
                R$
              </span>
              <input
                id="input-valor-total"
                type="text"
                value={valorTotalBruto}
                onChange={(e) => setValorTotalBruto(e.target.value)}
                placeholder="Ex: 7.600,00"
                autoComplete="off"
                disabled={pendente}
                className={cn(
                  "h-11 w-full rounded-xl border border-fio bg-sup2 pl-10 pr-3.5 font-mono text-[16px] font-medium text-texto placeholder:text-texto3",
                  "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none focus:ring-2 focus:ring-jade/20"
                )}
              />
            </div>

            {/* Painel Reativo de Cálculo: Quanto Falar pro Cliente x Comissão Empresa */}
            {calculo ? (
              <div className="rounded-xl border border-jade/30 bg-jade-fundo/40 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-jade font-semibold uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {calculo.regra}
                  </span>
                  <span className="text-texto3">Taxa 1,40% · Prazo 120m</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {/* Card 1: Quanto falar pro cliente */}
                  <div className="rounded-lg bg-sup border border-jade/40 p-2.5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-texto2">
                        Falar pro Cliente (Líquido):
                      </span>
                      <AppleBadge variant="success">
                        {calculo.percCliente}% na conta
                      </AppleBadge>
                    </div>
                    <div className="text-[18px] font-bold font-mono text-jade">
                      {calculo.valorClienteFormatado}
                    </div>
                  </div>

                  {/* Card 2: Comissão CapitalCred */}
                  <div className="rounded-lg bg-sup border border-fio p-2.5 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-texto3">
                        Comissão CapitalCred:
                      </span>
                      <AppleBadge variant="outline" dot={false}>
                        {calculo.percEmpresa}% empresa
                      </AppleBadge>
                    </div>
                    <div className="text-[18px] font-semibold font-mono text-texto2">
                      {calculo.valorEmpresaFormatado}
                    </div>
                  </div>
                </div>

                {/* Prévia da Mensagem Persuasiva Formatada */}
                <div className="pt-2 border-t border-jade/20">
                  <span className="text-[11px] font-mono uppercase text-texto3 block mb-1">
                    Prévia da Proposta Oficial:
                  </span>
                  <p className="text-[13px] leading-relaxed text-texto bg-sup/80 p-2.5 rounded-lg border border-fio font-sans">
                    &quot;{propostaOficial}&quot;
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Botão de Envio de Proposta Oficial */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-texto3">
              Enviará a proposta persuasiva estruturada na regra Santander 120m.
            </span>

            <AppleButton
              type="submit"
              variant="primary"
              size="md"
              disabled={!calculo || pendente}
              isLoading={pendente}
              icon={<Send className="h-4 w-4" />}
            >
              {pendente
                ? "Registrando…"
                : calculo
                ? `Enviar Proposta (${calculo.valorClienteFormatado})`
                : "Informe o valor total"}
            </AppleButton>
          </div>

          {estado.erro ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-erro-fundo border border-erro/30 text-erro text-[13px]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{estado.erro}</span>
            </div>
          ) : null}
        </form>
      ) : (
        /* MODO DIGITAÇÃO LIVRE / RESPOSTA MANUAL */
        <form action={enviar} className="space-y-3">
          <input type="hidden" name="id" value={idPendencia} />

          {/* Atalhos Rápidos */}
          {atalhos.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-texto3">
                Atalhos de Simulação
              </span>
              <div className="flex flex-wrap gap-1.5">
                {atalhos.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => usarAtalho(a.texto)}
                    title={a.texto}
                    className={cn(
                      "rounded-full border border-fio bg-sup2 px-3 py-1 text-[12px] font-medium text-texto2",
                      "transition-all hover:border-fio-forte hover:text-texto active:scale-95 cursor-pointer"
                    )}
                  >
                    {a.titulo}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Campo de Entrada Livre e Botão */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                ref={campoLivre}
                name="resposta"
                required
                autoComplete="off"
                placeholder="Ex: R$ 4.200, em 84x de R$ 138,00 ou margem R$ 350,00"
                disabled={pendente}
                className={cn(
                  "h-10 w-full rounded-xl border border-fio bg-sup px-3.5 text-[14px] text-texto placeholder:text-texto3",
                  "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none focus:ring-2 focus:ring-jade/20"
                )}
              />
            </div>

            <AppleButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={pendente}
              icon={<Send className="h-4 w-4" />}
              className="shrink-0"
            >
              {pendente ? "Anotando…" : "Gerar Rascunho"}
            </AppleButton>
          </div>

          <p className="text-[12px] text-texto3 leading-relaxed">
            Digite apenas os números oficiais. O motor formulará a mensagem personalizada no tom
            da CapitalCred e encaminhará para a aba <strong>Rascunhos</strong> antes de qualquer envio externo.
          </p>

          {estado.erro ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-erro-fundo border border-erro/30 text-erro text-[13px]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{estado.erro}</span>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}
