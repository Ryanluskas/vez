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
   Atalhos — as respostas que você dá o dia inteiro
------------------------------------------------------------------ */

/*
  O que o consultor de consignado repete todo dia. Ficam aqui e não no
  banco de fábrica porque ele precisa poder editar e apagar cada um —
  o "vou verificar" dele é diferente do de outro consultor.
*/
const ATALHOS_SUGERIDOS = [
  { titulo: "Vou verificar", texto: "vou verificar agora e já te retorno" },
  { titulo: "Sem margem", texto: "não tem margem disponível no momento" },
  { titulo: "Banco negou", texto: "o banco não aprovou dessa vez" },
  { titulo: "Em análise", texto: "já está em análise, assim que sair eu te aviso" },
  {
    titulo: "Pedir documentos",
    texto:
      "preciso de: documento com foto, comprovante de endereço, contracheque atualizado e agência/conta",
  },
  { titulo: "Valor liberado", texto: "R$ , em x de R$ " },
];

export async function criarAtalhosSugeridos(): Promise<Resultado> {
  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("atalhos").insert(
    ATALHOS_SUGERIDOS.map((a, i) => ({
      user_id: usuario.id,
      titulo: a.titulo,
      texto: a.texto,
      ordem: i,
    }))
  );

  if (error) return { erro: `Não consegui criar: ${error.message}` };

  revalidatePath("/meu-jeito");
  revalidatePath("/fila");
  return { ok: true };
}

export async function criarAtalho(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const titulo = texto(dados, "titulo").slice(0, 30);
  const conteudo = texto(dados, "texto").slice(0, 500);

  if (!titulo) return { erro: "Dê um nome curto pro atalho." };
  if (!conteudo) return { erro: "Escreva o texto do atalho." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("atalhos")
    .insert({ user_id: usuario.id, titulo, texto: conteudo, ordem: 99 });

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/meu-jeito");
  revalidatePath("/fila");
  return { ok: true };
}

export async function apagarAtalho(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Atalho não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("atalhos").delete().eq("id", id);

  if (error) return { erro: `Não consegui apagar: ${error.message}` };

  revalidatePath("/meu-jeito");
  revalidatePath("/fila");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Modo autônomo — o que sai sem passar por você
------------------------------------------------------------------ */

/*
  "valor" não está aqui e nunca vai estar. É a última barreira antes do
  envio, depois da regra rígida, do redator e da conferência de números —
  cada camada assume que a anterior falhou.
*/
export const CATEGORIAS_LIBERAVEIS = [
  { chave: "saudacao", nome: "Saudação e agradecimento", exemplo: "“bom dia”, “obrigado”" },
  { chave: "documentos", nome: "Documentos", exemplo: "“quais papéis preciso?”" },
  { chave: "prazo", nome: "Prazos", exemplo: "“quanto tempo demora?”" },
  { chave: "horario", nome: "Horário", exemplo: "“você atende sábado?”" },
  { chave: "acompanhamento", nome: "Acompanhamento e objeção", exemplo: "“e aí, saiu?”, “vou pensar”" },
  { chave: "elegibilidade", nome: "Se pode fazer, qual banco", exemplo: "“você trabalha com INSS?”" },
  { chave: "outro", nome: "Não classificado", exemplo: "o que a IA não soube encaixar" },
] as const;

export async function salvarModoAutonomo(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const ligado = dados.get("ligado") === "on";
  const escolhidas = dados
    .getAll("categoria")
    .map(String)
    .filter((c) => CATEGORIAS_LIBERAVEIS.some((x) => x.chave === c));

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  if (ligado && escolhidas.length === 0) {
    return { erro: "Marque pelo menos um assunto, senão ligar não muda nada." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("preferencias").upsert(
    {
      user_id: usuario.id,
      modo_autonomo: ligado,
      categorias: escolhidas,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/conta");
  revalidatePath("/rascunhos");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conhecimento — o que o bot sabe sobre a sua operação
------------------------------------------------------------------ */

/*
  Valor, taxa e parcela mudam por cliente. Se entrassem aqui, o bot passaria
  a citá-los sozinho — furando a regra de ouro por uma porta lateral, porque
  isto vira contexto fixo de todo prompt.

  CNPJ, CEP e número de endereço passam: são fatos da empresa, não do
  contrato de ninguém.
*/
const CHEIRO_DE_DINHEIRO = [
  { padrao: /r\$/i, o_que: "valor em reais" },
  { padrao: /\d\s*%/, o_que: "taxa" },
  { padrao: /\b\d{1,3}\s*x\b/i, o_que: "número de parcelas" },
  { padrao: /\b\d+,\d{2}\b/, o_que: "valor quebrado" },
  { padrao: /\b(parcela|prestação|juros|taxa de)\s+de\s+\d/i, o_que: "valor de parcela" },
];

function temNumeroQueMudaPorCliente(conteudo: string) {
  for (const { padrao, o_que } of CHEIRO_DE_DINHEIRO) {
    if (padrao.test(conteudo)) return o_que;
  }
  return null;
}

const CONHECIMENTO_SUGERIDO = [
  {
    assunto: "Quem somos",
    conteudo:
      "Somos a Capital Cred, correspondente bancário em Goiânia (GO). Instagram @capitalcred_ofc, site capitalcredgyn.com. Endereço: Rua Francisca C, 425, Setor Aeroporto, Goiânia GO, 74075-300. CNPJ 53.093.082/0001-22.",
  },
  {
    assunto: "Para quem trabalhamos",
    conteudo:
      "Crédito consignado para aposentados e pensionistas do INSS e para servidores públicos. Trabalhamos com bancos como Santander e Caixa.",
  },
  {
    assunto: "O que é a redução de taxa",
    conteudo:
      "Pegamos os contratos de consignado que o cliente já tem e fazemos a portabilidade com uma taxa de juros menor. A diferença entre a taxa antiga e a nova gera uma folga, e é essa folga que vira dinheiro liberado na conta dele.",
  },
  {
    assunto: "O prazo aumenta — sempre dizer",
    conteudo:
      "Na maioria das operações o prazo do contrato se alonga, e é exatamente isso que permite derrubar a taxa e liberar o valor sem pesar na parcela mensal. Sempre dizer isso ao cliente. Nunca afirmar que 'não muda nada' se o prazo aumenta: cliente que descobre depois vira reclamação e cancelamento.",
  },
  {
    assunto: "Refinanciamento",
    conteudo:
      "No refinanciamento a contagem de parcelas do contrato recomeça do zero, mas o que o cliente paga por mês continua igual ao que ele já pagava, com a taxa reduzida.",
  },
  {
    assunto: "Documentos necessários",
    conteudo:
      "Documento com foto, comprovante de endereço, contracheque atualizado e a agência e conta do banco. Para conferir a margem, pedimos o extrato de margem (Consig Fácil).",
  },
  {
    assunto: "Prazo de pagamento",
    conteudo:
      "Depois de aprovado, o dinheiro costuma cair na conta em até 2 dias úteis. O contrato passa por análise do banco antes disso.",
  },
  {
    assunto: "Quando não sai",
    conteudo:
      "O banco pode negar por política de crédito própria, ou o CPF pode ter alguma restrição que limita o valor. Isso é análise interna do banco e não dá para contestar.",
  },
];

export async function criarConhecimentoSugerido(): Promise<Resultado> {
  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conhecimento").insert(
    CONHECIMENTO_SUGERIDO.map((c, i) => ({
      user_id: usuario.id,
      assunto: c.assunto,
      conteudo: c.conteudo,
      ordem: i,
    }))
  );

  if (error) return { erro: `Não consegui criar: ${error.message}` };

  revalidatePath("/meu-jeito");
  return { ok: true };
}

export async function criarConhecimento(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const assunto = texto(dados, "assunto").slice(0, 60);
  const conteudo = texto(dados, "conteudo").slice(0, 1200);

  if (!assunto) return { erro: "Dê um assunto pro fato." };
  if (!conteudo) return { erro: "Escreva o que o bot precisa saber." };

  const cheiro = temNumeroQueMudaPorCliente(conteudo);
  if (cheiro) {
    return {
      erro: `Isso tem ${cheiro}, e valor muda por cliente. Se ficar aqui, o bot passa a dizer esse número pra todo mundo. Escreva sem o número.`,
    };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conhecimento")
    .insert({ user_id: usuario.id, assunto, conteudo, ordem: 99 });

  if (error) return { erro: `Não consegui salvar: ${error.message}` };

  revalidatePath("/meu-jeito");
  return { ok: true };
}

export async function apagarConhecimento(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Fato não identificado." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("conhecimento").delete().eq("id", id);

  if (error) return { erro: `Não consegui apagar: ${error.message}` };

  revalidatePath("/meu-jeito");
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
