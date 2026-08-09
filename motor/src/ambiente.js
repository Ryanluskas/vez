import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(RAIZ, ".env"), quiet: true });

/* Le e confere o .env. Se faltar alguma coisa, o erro diz exatamente qual. */
export function lerAmbiente() {
  // O Supabase renomeou a "anon key" para "publishable key": aceita os dois nomes.
  const chave =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  const faltando = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_PUBLISHABLE_KEY", chave],
    ["VEZ_EMAIL", process.env.VEZ_EMAIL],
    ["VEZ_SENHA", process.env.VEZ_SENHA],
  ]
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  if (faltando.length > 0) {
    throw new Error(
      `Faltam variaveis no motor/.env: ${faltando.join(", ")}.\n` +
        "Copie motor/.env.example para motor/.env e preencha. " +
        "As chaves do Supabase sao as mesmas do painel; o e-mail e a senha sao os da sua conta no painel."
    );
  }

  if (chave.startsWith("sb_secret") || chave.startsWith("service_role")) {
    throw new Error(
      "Essa e a chave secreta (service_role). Ela ignora o RLS e nao pode rodar aqui. " +
        "Use a chave publishable / anon, a mesma do painel."
    );
  }

  return {
    url: process.env.SUPABASE_URL,
    chave,
    email: process.env.VEZ_EMAIL,
    senha: process.env.VEZ_SENHA,
  };
}
