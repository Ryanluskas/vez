"use server";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, usuarioAtual } from "@/lib/supabase/servidor";
import { ETAPAS, type Etapa } from "@/lib/tipos";

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
   Conversas — dizer que aquele contato não é cliente
------------------------------------------------------------------ */

export async function alternarAtendimento(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const atenderAgora = texto(dados, "atender") === "true";

  if (!id) return { erro: "Conversa não identificada." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("conversas")
    .update({ atender: atenderAgora })
    .eq("id", id);

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  /*
    Silenciar tem que limpar o que aquele contato já sujou, senão o botão
    resolve o futuro e deixa o presente bagunçado — e a Fila só vale
    alguma coisa se tudo que estiver nela for gente esperando dinheiro.

    O histórico de mensagens fica: some só a fila e o rascunho.
  */
  if (!atenderAgora) {
    await supabase
      .from("pendencias")
      .delete()
      .eq("id_conversa", id)
      .eq("status", "aberta");

    await supabase
      .from("rascunhos")
      .update({ status: "descartado" })
      .eq("id_conversa", id)
      .eq("status", "pendente");

    await supabase
      .from("conversas")
      .update({ estagio: "respondido" })
      .eq("id", id);
  }

  revalidatePath("/conversas");
  revalidatePath("/fila");
  revalidatePath("/rascunhos");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conversas — mover no funil e ligar/desligar a cobrança
------------------------------------------------------------------ */

export async function mudarEtapa(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const etapa = texto(dados, "etapa") as Etapa;

  if (!id) return { erro: "Conversa não identificada." };
  if (!ETAPAS.includes(etapa)) return { erro: "Etapa desconhecida." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Mover no funil zera o contador de cobranças: se você acabou de mudar a
    etapa na mão, é porque a conversa andou — e cobrar alguém que acabou de
    andar é o jeito mais fácil de irritar cliente.
  */
  const { error } = await supabase
    .from("conversas")
    .update({ etapa, followups_enviados: 0 })
    .eq("id", id);

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

export async function alternarSeguimento(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const seguirAgora = texto(dados, "seguir") === "true";

  if (!id) return { erro: "Conversa não identificada." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conversas")
    .update({ seguir: seguirAgora })
    .eq("id", id);

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conexão — vários números de WhatsApp

   O painel roda na Vercel e não alcança a máquina do consultor. Toda ordem
   daqui é uma bandeira no banco; o motor vem buscar a cada 30 segundos.
------------------------------------------------------------------ */

export async function criarConexao(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const apelido = texto(dados, "apelido").slice(0, 40);
  if (!apelido) return { erro: "Dê um apelido pro número. Ex: Comercial." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conexoes")
    .insert({ user_id: usuario.id, apelido, estado: "desligado" });

  if (error) {
    return {
      erro: error.code === "23505" ? "Já existe um número com esse apelido." : error.message,
    };
  }

  revalidatePath("/conexao");
  return { ok: true };
}

export async function pedirDesconexao(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Número não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Levanta a bandeira. Quem desconecta de verdade é o motor: ele chama
    logout() no WhatsApp, o que remove o aparelho do celular também, apaga
    a sessão e volta a pedir QR.
  */
  const { error } = await supabase
    .from("conexoes")
    .update({ desconectar_pedido: true })
    .eq("id", id);

  if (error) return { erro: `Não consegui pedir: ${error.message}` };

  revalidatePath("/conexao");
  return { ok: true };
}

export async function pedirImportacao(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const dias = Number(texto(dados, "dias"));
  const filtro = texto(dados, "filtro") || "todas";

  if (!id) return { erro: "Número não identificado." };
  if (![2, 7, 30, 90].includes(dias)) return { erro: "Período inválido." };
  if (!["todas", "sem_resposta"].includes(filtro))
    return { erro: "Filtro inválido." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Levanta a bandeira; o motor traz o histórico em até 30 segundos.
    Importar não responde nada: as conversas entram como "novo", etapa que
    o follow-up não cobra. Quem decide o que fazer com cada uma é você.
  */
  const { error } = await supabase
    .from("conexoes")
    .update({ importar_dias: dias, importar_filtro: filtro })
    .eq("id", id);

  if (error) return { erro: `Não consegui pedir: ${error.message}` };

  revalidatePath("/conexao");
  return { ok: true };
}

export async function alternarConexaoAtiva(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const ativa = texto(dados, "ativa") === "true";
  if (!id) return { erro: "Número não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conexoes").update({ ativa }).eq("id", id);

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/conexao");
  return { ok: true };
}

export async function apagarConexao(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Número não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  // As conversas ficam: o histórico daquele número não some junto.
  const { error } = await supabase.from("conexoes").delete().eq("id", id);
  if (error) return { erro: `Não consegui apagar: ${error.message}` };

  revalidatePath("/conexao");
  revalidatePath("/conversas");
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
