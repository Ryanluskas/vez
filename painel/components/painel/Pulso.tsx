"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/cliente";

/*
  O painel tem que reagir sozinho: quando o motor cria uma pendencia nova,
  o contador da fila sobe sem ninguem apertar F5.
  Escuta as tabelas que mudam a fila e manda o servidor recarregar.
  Se o Realtime nao estiver ligado no projeto, isso simplesmente nao dispara —
  o painel continua funcionando, so nao se atualiza sozinho.
*/
export function Pulso() {
  const router = useRouter();

  useEffect(() => {
    let supabase;
    try {
      supabase = criarClienteNavegador();
    } catch {
      return;
    }

    const canal = supabase
      .channel("vez:pulso")
      .on("postgres_changes", { event: "*", schema: "public", table: "pendencias" }, () =>
        router.refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "rascunhos" }, () =>
        router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  return null;
}
