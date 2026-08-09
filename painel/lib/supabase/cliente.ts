"use client";

import { createBrowserClient } from "@supabase/ssr";
import { chavesDoSupabase } from "./ambiente";

/* Cliente do navegador. Usado so pra realtime (contadores da fila ao vivo). */
export function criarClienteNavegador() {
  const { url, chave } = chavesDoSupabase();
  return createBrowserClient(url, chave);
}
