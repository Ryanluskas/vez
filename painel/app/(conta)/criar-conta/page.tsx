import type { Metadata } from "next";
import Link from "next/link";
import { FormularioDeConta } from "@/components/conta/FormularioDeConta";
import { criarConta } from "@/lib/acoes";

export const metadata: Metadata = { title: "Criar conta" };

export default function PaginaDeCadastro() {
  return (
    <>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.03em]">
        Criar conta
      </h1>
      <p className="mt-1.5 mb-7 text-[13px] text-texto2">
        Seus clientes, sua fila e seu jeito de falar ficam só na sua conta.
      </p>

      <FormularioDeConta
        acao={criarConta}
        textoDoBotao="Criar conta"
        trabalhando="Criando…"
        dicaDaSenha="Pelo menos 6 caracteres."
        autoCompleteSenha="new-password"
      />

      <p className="mt-7 text-[13px] text-texto2">
        Já tem conta?{" "}
        <Link
          href="/entrar"
          className="text-jade underline underline-offset-4 hover:text-jade-forte"
        >
          Entrar
        </Link>
      </p>
    </>
  );
}
