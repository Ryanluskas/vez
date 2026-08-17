import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { SubirLista } from "@/components/listas/SubirLista";
import { CartaoDaLista } from "@/components/listas/CartaoDaLista";
import { OQueOBotFala } from "@/components/listas/OQueOBotFala";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Lista } from "@/lib/campos-da-lista";

export const metadata: Metadata = { title: "Listas" };

/*
  A tela onde o bot ganha a única fonte de valor que ele tem.

  Duas metades, e a ordem importa: primeiro as planilhas, depois o que ele
  pode falar delas. Subir uma planilha sozinho não faz o bot dizer nada —
  os campos começam todos desligados, de propósito.
*/
export default async function PaginaDeListas() {
  const supabase = await criarClienteServidor();

  const [{ data: listas, error }, { data: prefs }] = await Promise.all([
    supabase
      .from("listas")
      .select("id, nome, arquivo, linhas, ativa, criado_em")
      .order("criado_em", { ascending: false })
      .returns<Lista[]>(),
    supabase.from("preferencias").select("campos_da_lista, porcentagem_reducao").maybeSingle(),
  ]);

  if (error) {
    return (
      <Tela>
        <CabecalhoDeTela titulo="Listas" linha="Falta uma parte do banco para esta tela." />
        <div className="rounded-lg border border-fio bg-sup p-5">
          <p className="text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/19_listas.sql</code> no SQL Editor do
            Supabase e recarregue.
          </p>
        </div>
      </Tela>
    );
  }

  const todas = listas ?? [];
  const ativas = todas.filter((l) => l.ativa);
  const clientes = ativas.reduce((soma, l) => soma + l.linhas, 0);

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Listas"
        linha={
          todas.length === 0
            ? "Suba uma planilha e o bot passa a ter os valores desses clientes."
            : `${clientes.toLocaleString("pt-BR")} clientes em ${ativas.length} lista${
                ativas.length === 1 ? "" : "s"
              } ativa${ativas.length === 1 ? "" : "s"}.`
        }
        rotulo="Fonte de valor"
      />

      <SubirLista />

      {todas.length > 0 ? (
        <div className="mt-6 border-b border-fio">
          {todas.map((l) => (
            <CartaoDaLista key={l.id} lista={l} />
          ))}
        </div>
      ) : null}

      <OQueOBotFala
        camposLigados={prefs?.campos_da_lista ?? []}
        porcentagem={prefs?.porcentagem_reducao ?? 100}
        temLista={ativas.length > 0}
      />
    </Tela>
  );
}
