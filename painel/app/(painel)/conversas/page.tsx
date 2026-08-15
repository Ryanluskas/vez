import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { ControlesDaConversa } from "@/components/conversas/ControlesDaConversa";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ROTULO_DA_ETAPA, type Conversa } from "@/lib/tipos";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Conversas" };

/*
  Os filtros seguem o funil, não o processamento. O consultor pensa em
  "quem me mandou documento", não em "quem está com estágio rascunho_pronto".
*/
const FILTROS = [
  { chave: "todas", nome: "Todas", campo: null, valor: null },
  { chave: "sem_resposta", nome: "Sem resposta sua", campo: "ultima_direcao", valor: "recebida" },
  { chave: "documentos_recebidos", nome: "Mandaram documento", campo: "etapa", valor: "documentos_recebidos" },
  { chave: "aguardando_documentos", nome: "Devendo documento", campo: "etapa", valor: "aguardando_documentos" },
  { chave: "conversando", nome: "Conversando", campo: "etapa", valor: "conversando" },
  { chave: "travadas", nome: "Travadas com você", campo: "estagio", valor: "aguardando_voce" },
  { chave: "fechado", nome: "Fechados", campo: "etapa", valor: "fechado" },
  { chave: "comigo", nome: "Comigo", campo: "so_voce", valor: true },
  { chave: "silenciadas", nome: "Silenciadas", campo: "atender", valor: false },
] as const;

export default async function PaginaDeConversas({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filtro = FILTROS.find((x) => x.chave === f) ?? FILTROS[0];

  const supabase = await criarClienteServidor();

  let consulta = supabase
    .from("conversas")
    .select(
      "id, telefone, nome, estagio, etapa, ultima_mensagem, atualizado_em, atender, seguir, followups_enviados, ultima_direcao, so_voce"
    )
    .order("atualizado_em", { ascending: false })
    .limit(100);

  if (filtro.campo) consulta = consulta.eq(filtro.campo, filtro.valor);

  const { data, error } = await consulta.returns<Conversa[]>();
  const conversas = data ?? [];

  // As colunas do funil nascem no 06_funil.sql.
  if (error) {
    return (
      <Tela>
        <CabecalhoDeTela
          titulo="Conversas"
          linha="Falta uma parte do banco para esta tela funcionar."
        />
        <div className="rounded-lg border border-fio bg-sup p-5">
          <p className="text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/06_funil.sql</code> no SQL
            Editor do Supabase e recarregue.
          </p>
        </div>
      </Tela>
    );
  }

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Conversas"
        linha="Onde cada cliente está na venda. O bot cobra sozinho quem esfria."
      />

      <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
        {FILTROS.map((x) => (
          <Link
            key={x.chave}
            href={x.chave === "todas" ? "/conversas" : `/conversas?f=${x.chave}`}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[12px] whitespace-nowrap transition-colors",
              filtro.chave === x.chave
                ? "bg-sup2 text-texto"
                : "text-texto2 hover:bg-sup hover:text-texto"
            )}
          >
            {x.nome}
          </Link>
        ))}
      </div>

      {conversas.length === 0 ? (
        <Vazio
          titulo={
            filtro.chave === "todas" ? "Nenhuma conversa ainda" : "Nada aqui agora"
          }
          corpo={
            filtro.chave === "todas"
              ? "Assim que o motor estiver conectado ao seu WhatsApp, cada cliente que mandar mensagem aparece nesta lista."
              : "Troque o filtro acima para ver as outras conversas."
          }
        />
      ) : (
        <div className="border-b border-fio">
          {conversas.map((c) => (
            <article
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-3 border-t border-fio py-3"
            >
              <div className={cn("min-w-0 flex-1", !c.atender && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-x-3">
                  <span className="text-[14px] text-texto">{c.nome ?? "Sem nome"}</span>
                  <span className="num text-[12px] text-texto3">{c.telefone}</span>
                  {c.etapa === "documentos_recebidos" ? (
                    <span className="text-[11px] text-jade">
                      {ROTULO_DA_ETAPA[c.etapa]}
                    </span>
                  ) : null}
                  {c.estagio === "aguardando_voce" && c.atender ? (
                    <span className="text-[11px] text-brasa">travada com você</span>
                  ) : null}
                  {c.so_voce && c.atender ? (
                    <span className="text-[11px] text-brasa">só com você</span>
                  ) : null}
                  {!c.atender ? (
                    <span className="text-[11px] text-texto3">silenciado</span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[13px] text-texto2">
                  {c.ultima_mensagem ?? "—"}
                </p>
              </div>

              <ControlesDaConversa
                id={c.id}
                nome={c.nome ?? c.telefone}
                etapa={c.etapa}
                seguir={c.seguir}
                atendendo={c.atender}
                soVoce={c.so_voce ?? false}
                followups={c.followups_enviados ?? 0}
              />
            </article>
          ))}
        </div>
      )}
    </Tela>
  );
}
