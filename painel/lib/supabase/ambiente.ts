/* Chaves do Supabase. Nada hardcoded: se faltar, o erro diz exatamente o que falta. */

export function chavesDoSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chave) {
    throw new Error(
      "Faltam as chaves do Supabase. Copie .env.local.example para .env.local e preencha " +
        "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { url, chave };
}

/* Versao que nao explode: o proxy usa isso pra mandar todo mundo
   pra tela de configuracao em vez de derrubar a rota com 500. */
export function temChaves() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
