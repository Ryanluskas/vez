import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { chavesDoSupabase, temChaves } from "./ambiente";

/* Telas que existem sem estar logado. */
const PUBLICAS = ["/entrar", "/criar-conta", "/auth"];

/*
  Renova a sessao do Supabase a cada request e barra o que e privado.
  Isso e a primeira porta, nao a unica: cada Server Action confere o usuario
  de novo, e o RLS confere no banco. Tres camadas, de proposito.
*/
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const caminho = request.nextUrl.pathname;

  // Sem chaves nao existe produto: manda todo mundo pra tela que ensina
  // a configurar, em vez de estourar 500 em cada rota.
  if (!temChaves()) {
    if (caminho === "/configurar") return resposta;
    const destino = request.nextUrl.clone();
    destino.pathname = "/configurar";
    destino.search = "";
    return NextResponse.rewrite(destino);
  }

  if (caminho === "/configurar") {
    const destino = request.nextUrl.clone();
    destino.pathname = "/fila";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  const { url, chave } = chavesDoSupabase();

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar) {
        paraGravar.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        paraGravar.forEach(({ name, value, options }) =>
          resposta.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ehPublica = PUBLICAS.some((rota) => caminho.startsWith(rota));

  if (!user && !ehPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    if (caminho !== "/") destino.searchParams.set("de", caminho);
    return NextResponse.redirect(destino);
  }

  if (user && ehPublica && !caminho.startsWith("/auth")) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/fila";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}
