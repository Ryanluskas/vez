"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, usuarioAtual } from "@/lib/supabase/servidor";

export type Resultado = { erro?: string; ok?: boolean };

/*
  Toda acao confere o usuario de novo antes de tocar no banco.
  O proxy ja barrou quem nao esta logado, e o RLS vai barrar de novo la no
  Postgres — mas Server Action e uma porta propria, e porta se tranca sozinha.
*/
async function exigirLogin() {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("Sua sessão expirou. Entre de novo.");
  return usuario;
}

function texto(dados: FormData, campo: string) {
  return String(dados.get(campo) ?? "").trim();
}

/* ------------------------------------------------------------------
   Fila — responder uma pendência
------------------------------------------------------------------ */

export async function responderPendencia(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const resposta = texto(dados, "resposta");

  if (!id) return { erro: "Pendência não identificada." };
  if (!resposta) return { erro: "Escreva a resposta antes de enviar." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Aqui a conversa NAO e descongelada. Quem descongela e o motor, depois
    de transformar esta resposta num rascunho — senao o painel diria que
    esta tudo certo enquanto o cliente ainda nao recebeu nada.
  */
  const { error } = await supabase
    .from("pendencias")
    .update({
      resposta,
      status: "respondida",
      respondida_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "aberta");

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/fila");
  revalidatePath("/rascunhos");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Rascunhos — aprovar (com edição) ou descartar
------------------------------------------------------------------ */

export async function aprovarRascunho(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const textoFinal = texto(dados, "texto");

  if (!id) return { erro: "Rascunho não identificado." };
  if (!textoFinal) return { erro: "A mensagem não pode ir vazia." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Grava o texto EDITADO por cima do sugerido. Isso e de proposito: o que
    o motor envia e o que vira exemplo no "Meu jeito" e exatamente o que
    voce leu e aprovou na tela — nunca a versao anterior da IA.
  */
  const { error } = await supabase
    .from("rascunhos")
    .update({ texto_sugerido: textoFinal, status: "aprovado" })
    .eq("id", id)
    .eq("status", "pendente");

  if (error) return { erro: `Não consegui aprovar: ${error.message}` };

  revalidatePath("/rascunhos");
  revalidatePath("/conversas");
  return { ok: true };
}

export async function descartarRascunho(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Rascunho não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("rascunhos")
    .update({ status: "descartado" })
    .eq("id", id);

  if (error) return { erro: `Não consegui descartar: ${error.message}` };

  // Descartar nao envia nada, entao a conversa volta pro bot.
  const { data: rascunho } = await supabase
    .from("rascunhos")
    .select("id_conversa")
    .eq("id", id)
    .single();

  if (rascunho) {
    await supabase
      .from("conversas")
      .update({ estagio: "aguardando_bot" })
      .eq("id", rascunho.id_conversa);
  }

  revalidatePath("/rascunhos");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Meu jeito — apagar um exemplo que o bot não deveria imitar
------------------------------------------------------------------ */

export async function apagarExemplo(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Exemplo não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("respostas_boas").delete().eq("id", id);

  if (error) return { erro: `Não consegui apagar: ${error.message}` };

  revalidatePath("/meu-jeito");
  return { ok: true };
}
