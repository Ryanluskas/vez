"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarConexao, type Resultado } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { Plus, AlertCircle, Info } from "lucide-react";

export function AdicionarNumero({ quantos }: { quantos: number }) {
  const [estado, criar, criando] = useActionState(criarConexao, {} as Resultado);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado.ok]);

  return (
    <form
      action={criar}
      ref={form}
      className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-5 sm:p-6 space-y-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-sup2 border border-fio text-jade">
          <Plus className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-[15px] font-semibold text-texto tracking-tight">
            Adicionar Nova Linha WhatsApp
          </h3>
          <p className="text-[12px] text-texto2">
            Crie uma nova instância dedicada para atendimento via Evolution API v2.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
        <input
          name="apelido"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="Apelido da linha (Ex: Comercial 01, Portabilidade, INSS)"
          disabled={criando}
          aria-label="Apelido do número"
          className={cn(
            "h-10 min-w-0 flex-1 rounded-xl border border-fio bg-sup px-3.5 text-[14px] text-texto placeholder:text-texto3",
            "transition-colors hover:border-fio-forte focus:border-jade focus:outline-none focus:ring-2 focus:ring-jade/20"
          )}
        />

        <AppleButton
          type="submit"
          variant="primary"
          size="md"
          isLoading={criando}
          icon={<Plus className="h-4 w-4" />}
          className="shrink-0"
        >
          {criando ? "Criando Instância…" : "Conectar Número"}
        </AppleButton>
      </div>

      <div className="flex items-start gap-2 pt-1 text-[12px] text-texto3 leading-relaxed">
        <Info className="h-4 w-4 text-texto3 shrink-0 mt-0.5" />
        <span>
          Após criar a linha, o QR Code de autenticação aparecerá automaticamente no cartão correspondente acima.
          {quantos >= 3 && (
            <span className="block mt-1 text-amber-500 font-medium">
              Nota: você já possui {quantos} números registrados. Cada sessão do WhatsApp consome memória no contêiner da Evolution API.
            </span>
          )}
        </span>
      </div>

      {estado.erro ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-erro-fundo border border-erro/30 text-erro text-[13px]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{estado.erro}</span>
        </div>
      ) : null}
    </form>
  );
}
