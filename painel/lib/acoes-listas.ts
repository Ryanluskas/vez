"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { criarClienteServidor, usuarioAtual } from "@/lib/supabase/servidor";
import { CAMPOS_DA_LISTA } from "@/lib/campos-da-lista";
import type { Resultado } from "@/lib/acoes-painel";

/*
  ============================================================================
  AS LISTAS

  Uma planilha vira a única fonte de valor que o produto tem. Por isso o
  importador é chato: prefere recusar a planilha inteira a gravar uma linha
  cujo telefone ele não entendeu.

  Linha sem telefone legível não é gravada. Não é perda: o bot casa o cliente
  pelo WhatsApp, e uma linha sem telefone nunca seria encontrada mesmo —
  ficaria só ocupando espaço e inflando a contagem que o consultor lê na tela.
  ============================================================================
*/

const MAXIMO_DE_LINHAS = 20_000;
const LOTE = 500;

async function exigirLogin() {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("Sua sessão expirou. Entre de novo.");
  return usuario;
}

/*
  Espelho de `normalizarTelefone` em motor/src/lista.js. O motor procura
  pelos dois formatos; a gravação tem que produzir os dois iguais, senão a
  busca nunca acha.
*/
function normalizarTelefone(ddd: unknown, celular: unknown) {
  const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const d = so(ddd);
  const c = so(celular);
  if (!c) return { telefone: null, curto: null };

  const inteiro = `55${d}${c}`.replace(/^(55)+/, "55");
  return { telefone: inteiro, curto: c.slice(-8) };
}

/* ------------------------------------------------------------------
   Subir uma planilha
------------------------------------------------------------------ */

export async function subirLista(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const arquivo = dados.get("arquivo");
  const nomeDado = String(dados.get("nome") ?? "").trim();

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha uma planilha." };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  let linhas: Record<string, unknown>[];
  try {
    const buffer = await arquivo.arrayBuffer();
    const pasta = XLSX.read(buffer, { type: "array" });
    const primeira = pasta.SheetNames[0];
    if (!primeira) return { erro: "A planilha não tem nenhuma aba." };

    linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(pasta.Sheets[primeira], {
      defval: null,
    });
  } catch (e) {
    return { erro: `Não consegui ler a planilha: ${(e as Error).message}` };
  }

  if (linhas.length === 0) return { erro: "A planilha está vazia." };
  if (linhas.length > MAXIMO_DE_LINHAS) {
    return { erro: `Essa planilha tem ${linhas.length} linhas. O limite é ${MAXIMO_DE_LINHAS}.` };
  }

  const supabase = await criarClienteServidor();

  const { data: lista, error: erroDaLista } = await supabase
    .from("listas")
    .insert({
      user_id: usuario.id,
      nome: nomeDado || arquivo.name.replace(/\.(xlsx|xls|csv)$/i, ""),
      arquivo: arquivo.name,
      linhas: 0,
    })
    .select("id")
    .single();

  if (erroDaLista || !lista) {
    return { erro: `Não consegui criar a lista: ${erroDaLista?.message ?? "erro"}` };
  }

  const prontas = [];
  let semTelefone = 0;

  for (const linha of linhas) {
    const { telefone, curto } = normalizarTelefone(linha.DDD, linha.Celular ?? linha.Telefone);

    if (!telefone) {
      semTelefone++;
      continue;
    }

    prontas.push({
      user_id: usuario.id,
      id_lista: lista.id,
      nome: linha.Nome ? String(linha.Nome) : null,
      cpf: linha.CPF ? String(linha.CPF).replace(/\D/g, "") : null,
      telefone,
      telefone_curto: curto,
      dados: linha,
    });
  }

  if (prontas.length === 0) {
    // Sem nenhuma linha aproveitável, a lista vazia só confundiria a tela.
    await supabase.from("listas").delete().eq("id", lista.id);
    return {
      erro: "Nenhuma linha tinha telefone legível. A planilha precisa das colunas DDD e Celular.",
    };
  }

  for (let i = 0; i < prontas.length; i += LOTE) {
    const { error } = await supabase.from("lista_clientes").insert(prontas.slice(i, i + LOTE));
    if (error) {
      await supabase.from("listas").delete().eq("id", lista.id);
      return { erro: `Falhou no meio da importação: ${error.message}. Não gravei nada.` };
    }
  }

  await supabase.from("listas").update({ linhas: prontas.length }).eq("id", lista.id);

  revalidatePath("/listas");
  return {
    ok: true,
    erro: semTelefone
      ? `Importei ${prontas.length}. Pulei ${semTelefone} sem telefone legível.`
      : undefined,
  };
}

/* ------------------------------------------------------------------
   Ligar, desligar e apagar
------------------------------------------------------------------ */

export async function alternarLista(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = String(dados.get("id") ?? "");
  const ativa = String(dados.get("ativa") ?? "") === "true";
  if (!id) return { erro: "Lista não identificada." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("listas").update({ ativa }).eq("id", id);
  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/listas");
  return { ok: true };
}

export async function apagarLista(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = String(dados.get("id") ?? "");
  if (!id) return { erro: "Lista não identificada." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  // Os clientes caem por cascade.
  const { error } = await supabase.from("listas").delete().eq("id", id);
  if (error) return { erro: `Não consegui apagar: ${error.message}` };

  revalidatePath("/listas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   O que o bot pode falar, e por quanto
------------------------------------------------------------------ */

const CHAVES = new Set(CAMPOS_DA_LISTA.map((c) => c.chave));

export async function salvarCamposDaLista(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  /*
    Só chave conhecida entra. O formulário é do painel, mas Server Action é
    uma porta própria: qualquer um pode postar nela, e um campo inventado
    aqui viraria um campo que o motor não sabe o que é.
  */
  const campos = dados.getAll("campo").map(String).filter((c) => CHAVES.has(c));

  const bruto = Number(String(dados.get("porcentagem") ?? "100").replace(",", "."));
  const porcentagem = Math.round(bruto);

  if (!Number.isFinite(porcentagem) || porcentagem < 1 || porcentagem > 100) {
    return { erro: "A porcentagem tem que ficar entre 1 e 100." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("preferencias")
    .upsert(
      { user_id: usuario.id, campos_da_lista: campos, porcentagem_reducao: porcentagem },
      { onConflict: "user_id" }
    );

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/listas");
  return { ok: true };
}
