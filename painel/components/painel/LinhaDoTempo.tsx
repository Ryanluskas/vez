import { cn } from "@/lib/cn";
import type { EventoDoAgente } from "@/lib/dados";

/*
  A linha do tempo do agente.

  Formato: hora, o que aconteceu, e uma justificativa curta. Nada de
  raciocínio do modelo — o consultor precisa entender em três segundos, e
  três parágrafos de chain-of-thought não fazem ninguém entender nada.

  As cores separam três coisas que o olho precisa distinguir de longe:
  o que saiu pro cliente (jade), o que precisou de gente (morno) e o que
  falhou (brasa).
*/

const ROTULO: Record<string, string> = {
  mensagem_recebida: "Cliente enviou mensagem",
  classificacao: "Agente identificou a intenção",
  decisao: "Agente decidiu",
  ferramenta: "Ferramenta executada",
  resposta_gerada: "Resposta escrita",
  validacao: "Resposta validada",
  mensagem_enviada: "Mensagem enviada",
  handoff: "Passou para você",
  resposta_do_consultor: "Você respondeu",
  memoria: "Memória atualizada",
  funil: "Etapa mudou",
  followup: "Follow-up enviado",
  erro: "Erro",
  retry: "Tentando de novo",
};

const COR: Record<string, string> = {
  mensagem_enviada: "bg-jade",
  resposta_do_consultor: "bg-jade",
  handoff: "bg-morno",
  erro: "bg-brasa",
  retry: "bg-morno",
};

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LinhaDoTempo({ eventos }: { eventos: EventoDoAgente[] }) {
  return (
    <div className="rounded-2xl border border-fio bg-sup/50 backdrop-blur-xl p-5 divide-y divide-fio/40 space-y-3 shadow-sm">
      {eventos.map((e) => {
        const quem = e.conversas?.nome ?? e.conversas?.telefone ?? null;
        const falhou = !e.ok || e.tipo === "erro";

        return (
          <article
            key={e.id}
            className="flex items-start gap-3 pt-2.5 first:pt-0"
          >
            <span className="num shrink-0 pt-[3px] text-[11px] text-texto3">
              {hora(e.criado_em)}
            </span>

            <span
              aria-hidden="true"
              className={cn(
                "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                falhou ? "bg-brasa" : (COR[e.tipo] ?? "bg-fio-forte")
              )}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("text-[13px]", falhou ? "text-brasa" : "text-texto")}>
                  {ROTULO[e.tipo] ?? e.tipo}
                </span>

                {quem ? (
                  <span className="text-[12px] text-texto2">· {quem}</span>
                ) : null}

                {/*
                  O tempo só aparece quando é grande o bastante pra importar.
                  Número em toda linha vira ruído e ninguém lê nenhum.
                */}
                {e.ms !== null && e.ms > 1500 ? (
                  <span className="num text-[11px] text-texto3">
                    {(e.ms / 1000).toFixed(1)}s
                  </span>
                ) : null}
              </div>

              {e.detalhe ? (
                <p className="mt-0.5 truncate text-[12px] text-texto2">{e.detalhe}</p>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
