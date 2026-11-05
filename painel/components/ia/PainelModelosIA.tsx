"use client";

import { useActionState } from "react";
import { salvarConfigIA, type Resultado } from "@/lib/acoes-painel";
import type { ConfigIAPainel, ConsumoIARegistro } from "@/lib/dados";
import { cn } from "@/lib/cn";

const MODELOS_DISPONIVEIS = [
  { provedor: "gemini", modelo: "gemini-3.5-flash-lite", rotulo: "Google · Gemini 3.5 Flash Lite (Recomendado)", custo: "$0.0375 / 1M" },
  { provedor: "gemini", modelo: "gemini-3.5-flash", rotulo: "Google · Gemini 3.5 Flash", custo: "$0.075 / 1M" },
  { provedor: "gemini", modelo: "gemini-3.8-flash", rotulo: "Google · Gemini 3.8 Flash", custo: "$0.075 / 1M" },
  { provedor: "openai", modelo: "gpt-4o-mini", rotulo: "OpenAI · GPT-4o Mini (Rápido e econômico)", custo: "$0.15 / 1M" },
  { provedor: "openai", modelo: "gpt-4o", rotulo: "OpenAI · GPT-4o (Avançado)", custo: "$2.50 / 1M" },
  { provedor: "claude", modelo: "claude-3-5-haiku-latest", rotulo: "Anthropic · Claude 3.5 Haiku", custo: "$0.80 / 1M" },
  { provedor: "claude", modelo: "claude-3-5-sonnet-latest", rotulo: "Anthropic · Claude 3.5 Sonnet", custo: "$3.00 / 1M" },
  { provedor: "groq", modelo: "llama-3.3-70b-versatile", rotulo: "Groq · Llama 3.3 70B (Ultra veloz)", custo: "$0.59 / 1M" },
  { provedor: "ollama", modelo: "llama3.2:3b", rotulo: "Ollama · Llama 3.2 3B (Local / Offline)", custo: "Gratuito (Local)" },
];

export function PainelModelosIA({
  config,
  consumos,
  custoTotalHojeUsd,
}: {
  config: ConfigIAPainel;
  consumos: ConsumoIARegistro[];
  custoTotalHojeUsd: number;
}) {
  const [resultado, salvar, salvando] = useActionState(salvarConfigIA, {} as Resultado);

  return (
    <div className="space-y-8 pb-12">
      {/* Formulário de Configuração */}
      <form action={salvar} className="rounded-lg border border-fio bg-sup p-5 sm:p-6">
        <h3 className="text-[15px] font-medium text-texto">Orquestração Multiprovedor</h3>
        <p className="mt-1 text-[13px] text-texto2">
          Configure os modelos primários e de contingência. Em caso de sobrecarga (429) ou instabilidade de rede, o motor aciona o fallback mantendo a integridade comercial.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Modelo Primário */}
          <div>
            <label className="block text-[12px] font-medium uppercase tracking-wider text-texto3">
              Modelo Principal
            </label>
            <select
              name="modelo_primario"
              defaultValue={config.modelo_primario}
              className="mt-2 w-full rounded-md border border-fio bg-fundo px-3 py-2 text-[13px] text-texto focus:border-jade focus:outline-none"
              onChange={(e) => {
                const opt = MODELOS_DISPONIVEIS.find((m) => m.modelo === e.target.value);
                const inputProv = document.getElementById("provedor_primario") as HTMLInputElement;
                if (inputProv && opt) inputProv.value = opt.provedor;
              }}
            >
              {MODELOS_DISPONIVEIS.map((m) => (
                <option key={`pri_${m.modelo}`} value={m.modelo}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              id="provedor_primario"
              name="provedor_primario"
              defaultValue={config.provedor_primario}
            />
          </div>

          {/* Modelo Secundário (Fallback) */}
          <div>
            <label className="block text-[12px] font-medium uppercase tracking-wider text-texto3">
              Modelo de Contingência (Fallback)
            </label>
            <select
              name="modelo_secundario"
              defaultValue={config.modelo_secundario ?? "gpt-4o-mini"}
              className="mt-2 w-full rounded-md border border-fio bg-fundo px-3 py-2 text-[13px] text-texto focus:border-jade focus:outline-none"
              onChange={(e) => {
                const opt = MODELOS_DISPONIVEIS.find((m) => m.modelo === e.target.value);
                const inputProv = document.getElementById("provedor_secundario") as HTMLInputElement;
                if (inputProv && opt) inputProv.value = opt.provedor;
              }}
            >
              <option value="">Nenhum (Degradar para fila determinística)</option>
              {MODELOS_DISPONIVEIS.map((m) => (
                <option key={`sec_${m.modelo}`} value={m.modelo}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              id="provedor_secundario"
              name="provedor_secundario"
              defaultValue={config.provedor_secundario ?? "openai"}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-fio pt-4">
          <label className="flex items-center gap-2.5 text-[13px] text-texto cursor-pointer">
            <input
              type="checkbox"
              name="fallback_ativo"
              defaultChecked={config.fallback_ativo}
              className="h-4 w-4 rounded border-fio text-jade focus:ring-0"
            />
            <span>Ativar troca automática inteligente em caso de falha de cota ou rede</span>
          </label>

          <button
            type="submit"
            disabled={salvando}
            className={cn(
              "h-9 rounded-md bg-jade px-4 text-[13px] font-medium text-jade-texto",
              "transition-colors hover:bg-jade-forte disabled:opacity-45"
            )}
          >
            {salvando ? "Salvando…" : "Salvar Configuração"}
          </button>
        </div>

        {resultado.ok ? (
          <p className="mt-3 text-[13px] text-jade">✓ Configuração de IA atualizada com sucesso.</p>
        ) : null}
        {resultado.erro ? (
          <p role="alert" className="mt-3 text-[13px] text-erro">{resultado.erro}</p>
        ) : null}
      </form>

      {/* Métricas de Consumo e Custos */}
      <div className="rounded-lg border border-fio bg-sup p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-medium text-texto">Consumo de IA e Estimativa de Custos</h3>
            <p className="mt-1 text-[13px] text-texto2">
              Auditoria de requisições, latência e custos calculados em tempo de execução.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-texto3">Custo Hoje</span>
            <p className="font-mono text-[16px] font-semibold text-jade">
              ${custoTotalHojeUsd.toFixed(5)} USD
            </p>
          </div>
        </div>

        {consumos.length === 0 ? (
          <p className="mt-4 text-[13px] text-texto3">Nenhuma requisição registrada hoje.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-fio text-texto3">
                  <th className="pb-2 font-normal">Hora</th>
                  <th className="pb-2 font-normal">Provedor / Modelo</th>
                  <th className="pb-2 font-normal">Operação</th>
                  <th className="pb-2 font-normal">Entrada / Saída</th>
                  <th className="pb-2 font-normal">Latência</th>
                  <th className="pb-2 font-normal text-right">Custo Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fio/40 text-texto2">
                {consumos.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 font-mono text-texto3">
                      {new Date(c.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="py-2 text-texto font-medium">
                      {c.provedor.toUpperCase()} <span className="font-mono text-[11px] text-texto3">({c.modelo})</span>
                    </td>
                    <td className="py-2">{c.operacao}</td>
                    <td className="py-2 font-mono">
                      {c.tokens_entrada} / {c.tokens_saida}
                    </td>
                    <td className="py-2 font-mono">{c.latencia_ms}ms</td>
                    <td className="py-2 font-mono text-right text-texto">
                      ${Number(c.custo_estimado || 0).toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
