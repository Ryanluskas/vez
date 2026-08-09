import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { usuarioAtual } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Conexão" };

export default async function PaginaDeConexao() {
  const usuario = await usuarioAtual();

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Conexão"
        linha="O motor roda no seu computador. As mensagens dos seus clientes não passam por servidor nenhum."
      />

      <div className="rounded-lg border border-fio bg-sup p-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-texto3" />
          <span className="text-[14px] text-texto">Motor desligado</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-texto2">
          O aplicativo local que conecta seu WhatsApp e roda a IA ainda não foi
          instalado. Ele entra na Fase 2 — é ele quem lê as mensagens, decide o que
          responder e manda as dúvidas de valor para a Fila.
        </p>
      </div>

      <section className="mt-8">
        <span className="rotulo">Como vai funcionar</span>
        <ol className="mt-3 space-y-3">
          <Passo n={1} titulo="Instalar o motor no seu PC">
            Uma pasta com <code className="num text-texto">npm install</code> e{" "}
            <code className="num text-texto">npm start</code>. Precisa ficar rodando
            enquanto você quiser ser atendido.
          </Passo>
          <Passo n={2} titulo="Entrar com esta mesma conta">
            O motor faz login com{" "}
            <span className="num text-texto">{usuario?.email}</span>. É isso que amarra
            o que ele lê no WhatsApp à sua conta aqui.
          </Passo>
          <Passo n={3} titulo="Escanear o QR">
            O código aparece nesta tela. Você lê pelo WhatsApp do celular, como no
            WhatsApp Web.
          </Passo>
        </ol>
      </section>

      <p className="mt-8 border-t border-fio pt-5 text-[12px] leading-relaxed text-texto3">
        O motor precisa rodar local porque o WhatsApp Web e a IA (Ollama) exigem uma
        máquina ligada. É isso que mantém as conversas dos seus clientes dentro do seu
        computador e a IA sem mensalidade.
      </p>
    </Tela>
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
    <li className="flex gap-3.5">
      <span className="num mt-0.5 shrink-0 text-[12px] text-texto3">{n}</span>
      <div>
        <p className="text-[14px] text-texto">{titulo}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-texto2">{children}</p>
      </div>
    </li>
  );
}
