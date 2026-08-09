import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(RAIZ, ".env"), quiet: true });

/* Le e confere o .env. Se faltar alguma coisa, o erro diz exatamente qual. */
export function lerAmbiente() {
  const faltando = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "VEZ_EMAIL",
    "VEZ_SENHA",
  ].filter((nome) => !process.env[nome]);

  if (faltando.length > 0) {
    throw new Error(
      `Faltam variaveis no motor/.env: ${faltando.join(", ")}.\n` +
        "Copie motor/.env.example para motor/.env e preencha. " +
        "As chaves do Supabase sao as mesmas do painel; o e-mail e a senha sao os da sua conta no painel."
    );
  }

  return {
    url: process.env.SUPABASE_URL,
    chave: process.env.SUPABASE_ANON_KEY,
    email: process.env.VEZ_EMAIL,
    senha: process.env.VEZ_SENHA,
  };
}
