import type { Metadata } from "next";
import { Marca, Wordmark } from "@/components/marca/Wordmark";

export const metadata: Metadata = { title: "Configurar" };

/*
  Tela de primeira execucao. O proxy manda todo mundo pra ca enquanto
  as chaves do Supabase nao existirem — assim o primeiro contato com o
  produto e uma instrucao, nao um stack trace.
*/
export default function PaginaDeConfiguracao() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8">
      <div className="flex items-center gap-2.5">
        <Marca tamanho={24} />
        <Wordmark tamanho={21} />
      </div>

      <h1 className="mt-10 font-display text-[28px] font-bold leading-tight tracking-[-0.035em]">
        Falta ligar o banco
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-texto2">
        O painel precisa de um projeto Supabase para guardar suas conversas, sua fila e
        sua conta. São três passos, uma vez só.
      </p>

      <ol className="mt-9 space-y-7 border-t border-fio pt-7">
        <Passo n={1} titulo="Criar o projeto">
          Em <Externo href="https://supabase.com">supabase.com</Externo>, crie um
          projeto novo. O plano gratuito dá conta.
        </Passo>

        <Passo n={2} titulo="Copiar as chaves">
          Em <span className="text-texto">Project Settings → API</span>, copie a{" "}
          <span className="text-texto">Project URL</span> e a chave{" "}
          <span className="text-texto">anon public</span>. Cole no arquivo{" "}
          <code className="num text-texto">painel/.env.local</code> (copie o{" "}
          <code className="num text-texto">.env.local.example</code> ao lado):
          <pre className="mt-3 overflow-x-auto rounded-md border border-fio bg-sup px-3.5 py-3 font-mono text-[12px] leading-relaxed text-texto2">
            {`NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...`}
          </pre>
          <span className="mt-2 block text-[12px] text-texto3">
            A chave <span className="num">service_role</span> não entra aqui. Nunca.
          </span>
        </Passo>

        <Passo n={3} titulo="Criar as tabelas">
          No <span className="text-texto">SQL Editor</span> do Supabase, rode{" "}
          <code className="num text-texto">banco/01_tabelas.sql</code> e depois{" "}
          <code className="num text-texto">banco/02_rls.sql</code>. O segundo é o que
          isola os dados de cada consultor — não pule.
        </Passo>
      </ol>

      <p className="mt-10 border-t border-fio pt-6 text-[13px] text-texto2">
        Terminou? Reinicie o servidor (<code className="num text-texto">npm run dev</code>
        ) e recarregue esta página.
      </p>
    </div>
  );
}

function Passo({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="num mt-0.5 shrink-0 text-[12px] text-texto3">{n}</span>
      <div className="min-w-0">
        <p className="text-[15px] text-texto">{titulo}</p>
        <div className="mt-1.5 text-[13px] leading-relaxed text-texto2">{children}</div>
      </div>
    </li>
  );
}

function Externo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-jade underline underline-offset-4 hover:text-jade-forte"
    >
      {children}
    </a>
  );
}
