import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ROTULO_DO_ESTAGIO, type Conversa, type EstagioDaConversa } from "@/lib/tipos";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Conversas" };

const FILTROS: Array<{ chave: string; nome: string }> = [
  { chave: "todas", nome: "Todas" },
  { chave: "aguardando_voce", nome: "Travadas com você" },
  { chave: "rascunho_pronto", nome: "Rascunho pronto" },
  { chave: "aguardando_bot", nome: "Bot atendendo" },
  { chave: "respondido", nome: "Respondidas" },
];

export default async function PaginaDeConversas({
  searchParams,
}: {
  searchParams: Promise<{ estagio?: string }>;
}) {
  const { estagio } = await searchParams;
  const filtro = FILTROS.some((f) => f.chave === estagio) ? estagio! : "todas";

  const supabase = await criarClienteServidor();

  let consulta = supabase
    .from("conversas")
    .select("id, telefone, nome, estagio, ultima_mensagem, atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(100);

  if (filtro !== "todas") consulta = consulta.eq("estagio", filtro);

  const { data } = await consulta.returns<Conversa[]>();
  const conversas = data ?? [];

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Conversas"
        linha="Todo mundo que o bot atendeu, em que pé está cada um."
      />

      <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <Link
            key={f.chave}
            href={f.chave === "todas" ? "/conversas" : `/conversas?estagio=${f.chave}`}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors",
              filtro === f.chave
                ? "bg-sup2 text-texto"
                : "text-texto2 hover:bg-sup hover:text-texto"
            )}
          >
            {f.nome}
          </Link>
        ))}
      </div>

      {conversas.length === 0 ? (
        <Vazio
          titulo={
            filtro === "todas" ? "Nenhuma conversa ainda" : "Nada neste estágio agora"
          }
          corpo={
            filtro === "todas"
              ? "Assim que o motor estiver conectado ao seu WhatsApp, cada cliente que mandar mensagem aparece nesta lista."
              : "Troque o filtro acima para ver as outras conversas."
          }
        />
      ) : (
        <div className="border-b border-fio">
          {conversas.map((c) => (
            <article
              key={c.id}
              className="flex items-start justify-between gap-4 border-t border-fio py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="text-[14px] text-texto">{c.nome ?? "Sem nome"}</span>
                  <span className="num text-[12px] text-texto3">{c.telefone}</span>
                </div>
                <p className="mt-1 truncate text-[13px] text-texto2">
                  {c.ultima_mensagem ?? "—"}
                </p>
              </div>
              <Etiqueta estagio={c.estagio} />
            </article>
          ))}
        </div>
      )}
    </Tela>
  );
}

function Etiqueta({ estagio }: { estagio: EstagioDaConversa }) {
  const tom =
    estagio === "aguardando_voce"
      ? "text-brasa"
      : estagio === "rascunho_pronto"
        ? "text-jade"
        : "text-texto3";

  return (
    <span className={cn("shrink-0 text-[11px] whitespace-nowrap", tom)}>
      {ROTULO_DO_ESTAGIO[estagio]}
    </span>
  );
}
