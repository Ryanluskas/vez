"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type EstadoDoForm = { erro?: string; ok?: string };

/* O Supabase responde em ingles. Aqui vira portugues de gente, dizendo
   o que aconteceu e o que fazer — nunca "erro inesperado". */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha não conferem.";
  if (m.includes("email not confirmed"))
    return "Falta confirmar o e-mail. Procure a mensagem que enviamos.";
  if (m.includes("user already registered"))
    return "Esse e-mail já tem conta. Entre em vez de criar.";
  if (m.includes("password should be at least"))
    return "A senha precisa de pelo menos 6 caracteres.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Esse e-mail não parece válido.";
  return mensagem;
}

async function origemDaRequisicao() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const protocolo = h.get("x-forwarded-proto") ?? "http";
  return `${protocolo}://${host}`;
}

function caminhoSeguro(valor: FormDataEntryValue | null): string {
  const texto = typeof valor === "string" ? valor : "";
  // So aceita caminho interno: barra a volta pra dominio de fora.
  return texto.startsWith("/") && !texto.startsWith("//") ? texto : "/fila";
}

export async function entrar(
  _anterior: EstadoDoForm,
  dados: FormData
): Promise<EstadoDoForm> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");

  if (!email || !senha) return { erro: "Preencha o e-mail e a senha." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) return { erro: traduzir(error.message) };

  redirect(caminhoSeguro(dados.get("de")));
}

export async function criarConta(
  _anterior: EstadoDoForm,
  dados: FormData
): Promise<EstadoDoForm> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");

  if (!email || !senha) return { erro: "Preencha o e-mail e a senha." };
  if (senha.length < 6) return { erro: "A senha precisa de pelo menos 6 caracteres." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { emailRedirectTo: `${await origemDaRequisicao()}/auth/confirmar` },
  });

  if (error) return { erro: traduzir(error.message) };

  // Se o projeto exige confirmacao por e-mail, ainda nao existe sessao.
  if (!data.session) {
    return {
      ok: `Conta criada. Abra o e-mail em ${email} e clique no link de confirmação para entrar.`,
    };
  }

  redirect("/fila");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
