import { Marca, Wordmark } from "@/components/marca/Wordmark";

export default function LayoutDeConta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Lado esquerdo: o que o produto faz, dito de uma vez. Só no desktop. */}
      <aside className="hidden flex-1 flex-col justify-between border-r border-fio bg-fundo p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <Marca tamanho={24} />
          <Wordmark tamanho={21} />
        </div>

        <div className="max-w-md">
          <h2 className="font-display text-[38px] font-bold leading-[1.08] tracking-[-0.04em] text-texto">
            O bot atende.
            <br />
            Quando vira número,
            <br />
            <span className="text-jade">ele para e te chama.</span>
          </h2>
          <p className="mt-5 text-[14px] leading-relaxed text-texto2">
            Seu WhatsApp responde as dúvidas simples imitando seu jeito de falar.
            Quanto libera, valor de parcela, simulação — isso nunca. Essas perguntas
            congelam a conversa e entram numa fila, na ordem em que chegaram, esperando
            você. A IA roda no seu computador e não inventa número.
          </p>
        </div>

        <p className="text-[12px] text-texto3">
          As mensagens dos seus clientes ficam na sua máquina.
        </p>
      </aside>

      {/* Lado direito: o formulário. */}
      <div className="flex flex-1 items-center justify-center bg-sup px-5 py-12 sm:px-10">
        <div className="w-full max-w-[340px]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <Marca tamanho={24} />
            <Wordmark tamanho={21} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
