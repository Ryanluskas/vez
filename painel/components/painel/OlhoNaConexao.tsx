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
export function OlhoNaConexao({ conectado }: { conectado: boolean }) {
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

    // Conectado já: a batida lenta só serve pra perceber se cair.
    const intervalo = setInterval(() => router.refresh(), conectado ? 30_000 : 4_000);

    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [router, conectado]);

  return null;
}
