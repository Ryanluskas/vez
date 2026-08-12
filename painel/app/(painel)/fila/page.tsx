import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { ItemDaFila } from "@/components/fila/ItemDaFila";
import { NOME_DA_TEMPERATURA, COR_DA_BORDA } from "@/components/fila/espera";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Atalho } from "@/lib/tipos";

export const metadata: Metadata = { title: "Fila" };

type LinhaDaFila = {
  id: string;
  pergunta: string;
  contexto: string | null;
  motivo: string | null;
  criado_em: string;
  conversas: { nome: string | null; telefone: string } | null;
};

export default async function PaginaDaFila() {
  const supabase = await criarClienteServidor();

  /*
    O coracao do produto. Ordem de chegada, sempre — nunca por "importancia",
    nunca reordenado por nada. Quem esperou mais aparece primeiro.
    O RLS resolve o user_id: nao precisa (nem deve) filtrar aqui na mao.
  */
  const [{ data, error }, listaDeAtalhos] = await Promise.all([
    supabase
      .from("pendencias")
      .select("id, pergunta, contexto, motivo, criado_em, conversas(nome, telefone)")
      .eq("status", "aberta")
      .order("criado_em", { ascending: true })
      .returns<LinhaDaFila[]>(),
    supabase
      .from("atalhos")
      .select("id, titulo, texto, ordem")
      .order("ordem")
      .order("criado_em")
      .returns<Atalho[]>(),
  ]);

  const pendencias = data ?? [];
  const atalhos = listaDeAtalhos.data ?? [];
  const agoraServidor = new Date().toISOString();

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Fila"
        linha={
          pendencias.length === 0
            ? "Ninguém travado esperando um número seu."
            : `${pendencias.length} ${
                pendencias.length === 1 ? "pessoa travada" : "pessoas travadas"
              } esperando um número seu.`
        }
        rotulo="Mais antigo primeiro"
      />

      {error || pendencias.length === 0 ? (
        <Vazio
          titulo="A fila está limpa"
          corpo="Quando um cliente perguntar quanto libera, qual a parcela ou qualquer coisa de valor, o bot congela aquela conversa e a pergunta aparece aqui — na ordem em que chegou."
          acao={
            <Link
              href="/conexao"
              className="text-[13px] text-jade underline underline-offset-4 hover:text-jade-forte"
            >
              Conectar o WhatsApp
            </Link>
          }
        />
      ) : (
        <>
          <div className="border-b border-fio">
            {pendencias.map((p) => (
              <ItemDaFila
                key={p.id}
                id={p.id}
                criadoEm={p.criado_em}
                agoraServidor={agoraServidor}
                nome={p.conversas?.nome ?? "Sem nome"}
                telefone={p.conversas?.telefone ?? ""}
                pergunta={p.pergunta}
                contexto={p.contexto}
                motivo={p.motivo}
                atalhos={atalhos}
              />
            ))}
          </div>

          <Legenda />
        </>
      )}
    </Tela>
  );
}

function Legenda() {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {(["nova", "esperando", "esfriando"] as const).map((t) => (
        <span key={t} className="flex items-center gap-2 text-[11px] text-texto3">
          <span aria-hidden="true" className={`h-[2px] w-3 ${COR_DA_BORDA[t]}`} />
          {NOME_DA_TEMPERATURA[t]}
        </span>
      ))}
    </div>
  );
}
