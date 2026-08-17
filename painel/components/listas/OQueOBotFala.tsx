"use client";

import { useActionState, useState } from "react";
import { salvarCamposDaLista } from "@/lib/acoes-listas";
import { CAMPOS_DA_LISTA } from "@/lib/campos-da-lista";
import type { Resultado } from "@/lib/acoes-painel";
import { cn } from "@/lib/cn";

/*
  O que o bot pode falar da lista, e por quanto.

  Os campos começam todos desligados de propósito: subir uma planilha não
  pode, sozinho, fazer o bot sair dizendo o saldo devedor de ninguém. Ligar
  cada um é uma decisão consciente.

  A prévia ao lado da porcentagem existe porque "66%" é abstrato e "de
  R$ 3.174,54 o cliente ouve R$ 2.095,20" não é. O consultor confere a conta
  antes de o primeiro cliente ouvir o número.
*/
export function OQueOBotFala({
  camposLigados,
  porcentagem,
  temLista,
}: {
  camposLigados: string[];
  porcentagem: number;
  temLista: boolean;
}) {
  const [estado, salvar, salvando] = useActionState(salvarCamposDaLista, {} as Resultado);
  const [pct, setPct] = useState(String(porcentagem));

  const numero = Number(pct.replace(",", "."));
  const valido = Number.isFinite(numero) && numero >= 1 && numero <= 100;

  /* Um valor de exemplo real, da planilha do usuário. */
  const EXEMPLO = 3174.54;
  const reduzido = valido ? (EXEMPLO * numero) / 100 : null;

  const emReais = (n: number) =>
    `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <form action={salvar} className="mt-8">
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em] text-texto">
        O que o bot pode falar
      </h2>
      <p className="mt-1 mb-4 text-[13px] leading-relaxed text-texto2">
        Campo desligado o bot nem enxerga — não é escondido da mensagem, é ausente da consulta.
        {!temLista ? " Sem lista ativa, nada disso vale: tudo continua indo pra Fila." : ""}
      </p>

      <div className="grid gap-px overflow-hidden rounded-lg border border-fio bg-fio sm:grid-cols-2">
        {CAMPOS_DA_LISTA.map((campo) => (
          <label
            key={campo.chave}
            className="flex cursor-pointer items-start gap-2.5 bg-sup p-3.5 transition-colors hover:bg-sup2"
          >
            <input
              type="checkbox"
              name="campo"
              value={campo.chave}
              defaultChecked={camposLigados.includes(campo.chave)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-jade"
            />
            <span className="min-w-0">
              <span className="block text-[13px] text-texto">
                {campo.rotulo}
                {campo.aplicaPorcentagem ? (
                  <span className="ml-1.5 text-[11px] text-jade">a porcentagem incide aqui</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-texto3">
                {campo.ajuda}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* ---------------------------------------------------- porcentagem */}

      <div className="mt-4 rounded-lg border border-fio bg-sup p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            <span className="text-[13px] text-texto">O cliente ouve</span>
            <input
              type="text"
              name="porcentagem"
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              aria-label="Porcentagem da redução"
              className={cn(
                "num h-8 w-16 rounded-md border bg-fundo px-2 text-center text-[13px] text-texto focus:outline-none",
                valido ? "border-fio focus:border-jade" : "border-brasa"
              )}
            />
            <span className="text-[13px] text-texto">% da redução</span>
          </label>

          {reduzido !== null ? (
            <span className="text-[12px] text-texto2">
              De <span className="num text-texto3">{emReais(EXEMPLO)}</span> na planilha, ele
              ouve <span className="num text-jade">{emReais(reduzido)}</span>
            </span>
          ) : (
            <span className="text-[12px] text-brasa">Entre 1 e 100.</span>
          )}
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-texto3">
          A conta é feita no motor, antes de a IA ver qualquer coisa — ela recebe o número já
          reduzido e não tem como voltar ao valor cheio.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvando || !valido}
          className="h-8 rounded-md bg-jade px-4 text-[13px] text-fundo transition-colors hover:bg-jade-forte disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>

        {estado.ok ? <span className="text-[12px] text-jade">Salvo.</span> : null}
        {estado.erro ? <span className="text-[12px] text-brasa">{estado.erro}</span> : null}
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-texto3">
        Mensagem com valor da lista <strong className="text-texto2">sempre</strong> espera sua
        aprovação em Rascunhos, mesmo em modo autônomo. A planilha casa o cliente pelo telefone,
        e telefone trocado numa linha viraria o saldo de um cliente indo pro outro.
      </p>
    </form>
  );
}
