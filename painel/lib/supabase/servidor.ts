import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { chavesDoSupabase } from "./ambiente";

/*
  Cliente para Server Components, Server Actions e Route Handlers.
  A sessao vive em cookie; o RLS do Postgres usa esse token pra decidir
  o que cada consultor enxerga. Nao existe caminho que ignore o user_id.
*/
export async function criarClienteServidor() {
  // cookies() primeiro, de proposito: e o que marca a rota como dinamica.
  // Se as chaves fossem lidas antes, o build tentaria pre-renderizar a tela
  // e quebraria no erro de configuracao em vez de renderizar em request.
  const pote = await cookies();
  const { url, chave } = chavesDoSupabase();

  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return pote.getAll();
      },
      setAll(paraGravar) {
        try {
          paraGravar.forEach(({ name, value, options }) => {
            pote.set(name, value, options);
          });
        } catch {
          // Server Component nao pode gravar cookie. Tudo bem: quem renova
          // a sessao e o proxy.ts, que roda antes da renderizacao.
        }
      },
    },
  });
}

/* Usuario logado, ou null. */
export async function usuarioAtual() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
