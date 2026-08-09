import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/* Destino do link de confirmação que o Supabase manda por e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/fila`);
  }

  return NextResponse.redirect(
    `${origin}/entrar?aviso=${encodeURIComponent(
      "Esse link de confirmação expirou ou já foi usado. Entre com seu e-mail e senha."
    )}`
  );
}
