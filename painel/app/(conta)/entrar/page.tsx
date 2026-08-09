import type { Metadata } from "next";
import Link from "next/link";
import { FormularioDeConta } from "@/components/conta/FormularioDeConta";
import { Aviso } from "@/components/ui/Aviso";
import { entrar } from "@/lib/acoes";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaDeEntrada({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; aviso?: string }>;
}) {
  const { de, aviso } = await searchParams;

  return (
    <>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.03em]">Entrar</h1>
      <p className="mt-1.5 mb-7 text-[13px] text-texto2">
        Sua fila continua exatamente onde você parou.
      </p>

      {aviso ? (
        <div className="mb-5">
          <Aviso>{aviso}</Aviso>
        </div>
      ) : null}

      <FormularioDeConta
        acao={entrar}
        textoDoBotao="Entrar"
        trabalhando="Entrando…"
        de={de}
        autoCompleteSenha="current-password"
      />

      <p className="mt-7 text-[13px] text-texto2">
        Ainda não tem conta?{" "}
        <Link
          href="/criar-conta"
          className="text-jade underline underline-offset-4 hover:text-jade-forte"
        >
          Criar conta
        </Link>
      </p>
    </>
  );
}
