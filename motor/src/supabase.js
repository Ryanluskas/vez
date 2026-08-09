import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { log } from "./log.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO_DA_SESSAO = path.join(RAIZ, "sessao", "supabase.json");

/*
  O supabase-js foi feito pro navegador e guarda a sessao no localStorage.
  Aqui trocamos isso por um arquivo, pra o consultor nao ter que digitar
  a senha toda vez que liga o motor. O arquivo fica em motor/sessao/,
  que esta no .gitignore — sao credenciais de verdade.
*/
const armazenamentoEmArquivo = {
  getItem(chave) {
    try {
      return JSON.parse(fs.readFileSync(ARQUIVO_DA_SESSAO, "utf8"))[chave] ?? null;
    } catch {
      return null;
    }
  },
  setItem(chave, valor) {
    const tudo = (() => {
      try {
        return JSON.parse(fs.readFileSync(ARQUIVO_DA_SESSAO, "utf8"));
      } catch {
        return {};
      }
    })();
    tudo[chave] = valor;
    fs.mkdirSync(path.dirname(ARQUIVO_DA_SESSAO), { recursive: true });
    fs.writeFileSync(ARQUIVO_DA_SESSAO, JSON.stringify(tudo), { mode: 0o600 });
  },
  removeItem(chave) {
    try {
      const tudo = JSON.parse(fs.readFileSync(ARQUIVO_DA_SESSAO, "utf8"));
      delete tudo[chave];
      fs.writeFileSync(ARQUIVO_DA_SESSAO, JSON.stringify(tudo), { mode: 0o600 });
    } catch {
      // Nao existe sessao guardada: nada a remover.
    }
  },
};

export function criarClienteDoMotor({ url, chave }) {
  return createClient(url, chave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: armazenamentoEmArquivo,
    },
  });
}

/*
  Entra na conta do consultor. Da segunda vez em diante usa a sessao
  guardada e nem toca na senha.
*/
export async function entrarNaConta(supabase, { email, senha }) {
  const { data: guardada } = await supabase.auth.getSession();

  if (!guardada.session) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("invalid login credentials")) {
        throw new Error(
          `E-mail ou senha nao conferem para ${email}. Confira VEZ_EMAIL e VEZ_SENHA no motor/.env — tem que ser a mesma conta do painel.`
        );
      }
      if (m.includes("email not confirmed")) {
        throw new Error(
          `A conta ${email} ainda nao foi confirmada. Abra o link que o Supabase mandou por e-mail e rode o motor de novo.`
        );
      }
      throw new Error(`Nao consegui entrar na conta: ${error.message}`);
    }

    log.info("Login feito. A sessao fica guardada em motor/sessao/.");
  } else {
    log.info("Sessao guardada encontrada, sem precisar de senha.");
  }

  const {
    data: { user },
    error: erroDoUsuario,
  } = await supabase.auth.getUser();

  if (erroDoUsuario || !user) {
    throw new Error(
      "A sessao guardada nao vale mais. Apague a pasta motor/sessao/ e rode de novo."
    );
  }

  return user;
}
