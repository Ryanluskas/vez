"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { criarClienteNavegador } from "@/lib/supabase/cliente";

/*
  Enquanto o motor nao esta conectado, esta tela precisa reagir sozinha:
  o QR troca a cada poucos segundos e a conexao pode cair a qualquer hora.
  Realtime pra ser instantaneo, e uma batida de 4s como rede de seguranca
  caso o Realtime nao esteja ligado no projeto.
*/
export function OlhoNaConexao({
  conectado,
  importando = false,
}: {
  conectado: boolean;
  importando?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    let supabase;
    try {
      supabase = criarClienteNavegador();
    } catch {
      return;
    }

    const canal = supabase
      .channel("vez:conexao")
      .on("postgres_changes", { event: "*", schema: "public", table: "conexoes" }, () =>
        router.refresh()
      )
      .subscribe();

    /*
      Importando: 3s, pra barra de progresso andar de verdade.
      Esperando QR: 4s, porque o código troca sozinho.
      Conectado e parado: 30s, só pra perceber se cair.
    */
    const passo = importando ? 3_000 : conectado ? 30_000 : 4_000;
    const intervalo = setInterval(() => router.refresh(), passo);

    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [router, conectado, importando]);

  return null;
}
