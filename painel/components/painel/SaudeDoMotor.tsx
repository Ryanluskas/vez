import { cn } from "@/lib/cn";
import type { SaudeDoMotor as Estado } from "@/lib/dados";

/*
  O motor roda na máquina do consultor. Esta é a única coisa no painel que
  ele não consegue deduzir olhando os dados: se o programa está de pé.

  Sem isso o painel mente por omissão — mostra a fila vazia e o consultor
  conclui que ninguém escreveu, quando na verdade o motor caiu às 9h.
*/

const APARENCIA: Record<Estado["estado"], { cor: string; texto: string; linha: string }> = {
  ligado: {
    cor: "bg-jade",
    texto: "Motor ligado",
    linha: "Atendendo. As mensagens que chegam estão sendo tratadas.",
  },
  reconectando: {
    cor: "bg-morno",
    texto: "Reconectando",
    linha: "O WhatsApp caiu e o motor está reabrindo. Mensagens deste período entram quando voltar.",
  },
  erro: {
    cor: "bg-brasa",
    texto: "Motor com erro",
    linha: "O motor está de pé mas alguma coisa falhou. Veja o detalhe e o terminal.",
  },
  offline: {
    cor: "bg-texto3",
    texto: "Motor desligado",
    linha: "Nada está sendo atendido. Ligue o motor na sua máquina.",
  },
};

const NOME_DO_SERVICO: Record<string, string> = {
  ollama: "IA local",
  groq: "IA de escrita",
  supabase: "Banco",
};

const NOME_DA_SAUDE: Record<string, string> = {
  ok: "respondendo",
  instavel: "instável",
  aberto: "fora do ar",
};

export function SaudeDoMotor({ estado }: { estado: Estado }) {
  if (!estado.tabelaPronta) {
    return (
      <div className="rounded-lg border border-fio bg-sup p-4">
        <p className="text-[13px] text-texto">Falta uma parte do banco pra ver o motor daqui.</p>
        <p className="mt-1 text-[12px] text-texto2">
          Rode <code className="num text-texto">banco/18_observabilidade.sql</code> no SQL Editor
          do Supabase.
        </p>
      </div>
    );
  }

  const visual = APARENCIA[estado.estado];
  const servicos = Object.entries(estado.servicos);

  return (
    <div className="rounded-lg border border-fio bg-sup p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", visual.cor)} />
        <span className="text-[14px] text-texto">{visual.texto}</span>

        {estado.desdeMs !== null && estado.estado !== "offline" ? (
          <span className="num text-[11px] text-texto3">
            sinal de {Math.round(estado.desdeMs / 1000)}s atrás
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-texto2">{visual.linha}</p>

      {estado.detalhe ? (
        <p className="mt-1 text-[12px] text-morno">{estado.detalhe}</p>
      ) : null}

      {/*
        A saúde de cada dependência externa. É o que responde "por que o bot
        parou de responder sozinho?" sem precisar abrir o terminal: quase
        sempre é o Ollama que caiu quando a máquina dormiu.
      */}
      {servicos.length ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-fio pt-2.5">
          {servicos.map(([nome, saude]) => (
            <span key={nome} className="flex items-center gap-1.5 text-[11px]">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  saude === "ok" ? "bg-jade" : saude === "instavel" ? "bg-morno" : "bg-brasa"
                )}
              />
              <span className="text-texto2">{NOME_DO_SERVICO[nome] ?? nome}</span>
              <span className="text-texto3">{NOME_DA_SAUDE[saude] ?? saude}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
