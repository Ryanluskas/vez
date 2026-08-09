import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  matcher: [
    // Tudo, menos estaticos e arquivos de imagem.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
