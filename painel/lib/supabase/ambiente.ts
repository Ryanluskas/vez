/* Chaves do Supabase. Nada hardcoded: se faltar ou vier torto,
   o erro diz exatamente o que esta errado. */

/*
  Colar variavel de ambiente no painel da Vercel erra de um jeito so:
  vem o nome junto ("NEXT_PUBLIC_SUPABASE_URL=https://..."), vem entre
  aspas, ou vem com espaco/quebra de linha no fim. Limpa os tres.
*/
function limpar(valor: string | undefined, nome: string) {
  if (!valor) return "";
  let v = valor.trim();
  if (v.startsWith(`${nome}=`)) v = v.slice(nome.length + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function ler() {
  const url = limpar(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");

  // O Supabase renomeou a "anon key" para "publishable key". Os projetos novos
  // vem com o nome novo, os antigos com o velho: aceita os dois.
  const chave =
    limpar(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    ) || limpar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // URL torta e o erro mais comum, e sem essa checagem ela vira um 500 seco
  // la na frente, dentro do cliente do Supabase.
  const urlValida = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url);

  return { url, chave, urlValida };
}

export function chavesDoSupabase() {
  const { url, chave, urlValida } = ler();

  if (!url || !chave) {
    throw new Error(
      "Faltam as chaves do Supabase. Preencha NEXT_PUBLIC_SUPABASE_URL e " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  if (!urlValida) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL não parece uma URL do Supabase: "${url}". ` +
        "O valor tem que ser só https://seu-projeto.supabase.co — sem o nome da " +
        "variável junto, sem aspas e sem espaço no fim."
    );
  }

  return { url, chave };
}

/* Versao que nao explode: o proxy usa isso pra mandar todo mundo
   pra tela de configuracao em vez de derrubar a rota com 500. */
export function temChaves() {
  const { chave, urlValida } = ler();
  return Boolean(urlValida && chave);
}
