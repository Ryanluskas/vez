"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { criarClienteServidor, usuarioAtual } from "@/lib/supabase/servidor";
import { ETAPAS, type Etapa } from "@/lib/tipos";
/*
  Estas listas ficam num modulo proprio porque um arquivo "use server" so
  pode EXPORTAR funcoes async. Importar dado aqui e livre; exportar nao era,
  e um array exportado daqui derrubava /meu-jeito em runtime com o build
  passando limpo.
*/
import { CATEGORIAS_LIBERAVEIS, MODOS } from "@/lib/modos";

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
   Conversas — devolver ao bot uma conversa que travou na sua mão

   O motor liga `so_voce` sozinho quando a mesma conversa volta pra você
   três vezes sem sair do lugar. Ele nunca desliga: quem decide que o caso
   destravou é você. Sem este botão, a proteção contra loop seria uma
   conversa presa para sempre.
------------------------------------------------------------------ */

export async function devolverAoBot(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  if (!id) return { erro: "Conversa não identificada." };

  try {
    await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  /*
    Zerar o contador junto é obrigatório. Devolver sem zerar faria o freio
    pegar de novo na primeira dúvida, e o botão pareceria quebrado.
  */
  const { error } = await supabase
    .from("conversas")
    .update({ so_voce: false, escalonamentos: 0 })
    .eq("id", id);

  if (error) return { erro: `Não consegui devolver: ${error.message}` };

  revalidatePath("/conversas");
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
    .insert({ user_id: usuario.id, apelido, estado: "desligado", ativa: true });

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

  // 1. Busca a conexão para remover da Evolution API caso exista
  const { data: cx } = await supabase
    .from("conexoes")
    .select("evolution_instancia")
    .eq("id", id)
    .maybeSingle();

  if (cx?.evolution_instancia) {
    try {
      const serverUrl = process.env.EVOLUTION_SERVER_URL || "http://localhost:8080";
      const apiKey =
        process.env.EVOLUTION_API_KEY ||
        "fbd3fd31e1aa735f2c29d050fea8ec3d53777bdb2539fe8fed0f4af4b2cda32c";
      await fetch(`${serverUrl}/instance/delete/${cx.evolution_instancia}`, {
        method: "DELETE",
        headers: { apikey: apiKey },
      });
    } catch {}
  }

  // 2. Remove referências filhas e desata conflitos de chave única antes da exclusão
  await supabase.from("solicitacoes_followup").delete().eq("id_conexao", id);

  // Busca conversas ligadas a esta conexão
  const { data: convsConexao } = await supabase
    .from("conversas")
    .select("id, telefone")
    .eq("id_conexao", id);

  if (convsConexao && convsConexao.length > 0) {
    const telefones = convsConexao.map((c) => c.telefone);

    // Identifica se já existem conversas com id_conexao IS NULL para esses mesmos telefones
    const { data: convsSemConexao } = await supabase
      .from("conversas")
      .select("id, telefone")
      .is("id_conexao", null)
      .in("telefone", telefones);

    const telefonesConflitantes = new Set(
      (convsSemConexao || []).map((c) => c.telefone)
    );

    // Se houver conflito de chave única (user_id, null, telefone), apaga as conversas conflitantes da conexão
    const idsParaApagar = convsConexao
      .filter((c) => telefonesConflitantes.has(c.telefone))
      .map((c) => c.id);

    if (idsParaApagar.length > 0) {
      await supabase.from("conversas").delete().in("id", idsParaApagar);
    }

    // Para as demais, remove diretamente desta conexão
    await supabase.from("conversas").delete().eq("id_conexao", id);
  }

  // 3. Remove a linha em conexões
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

export async function salvarModoAutonomo(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const modo = texto(dados, "modo") || "manual";
  if (!MODOS.some((m) => m.chave === modo)) return { erro: "Modo desconhecido." };

  const ligado = modo !== "manual";
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
      modo,
      // Espelho da coluna antiga: o motor lê `modo`, mas quem ainda ler
      // `modo_autonomo` continua vendo a verdade.
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


/* ------------------------------------------------------------------
   Follow-ups supervisionados — aprovar (com edição opcional) ou rejeitar
------------------------------------------------------------------ */

export async function aprovarFollowup(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const textoEditado = texto(dados, "texto");

  if (!id) return { erro: "Follow-up não identificado." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  // 1. Autorização estrita e conferência de propriedade
  const { data: sol, error: erroBusca } = await supabase
    .from("solicitacoes_followup")
    .select("id, user_id, mensagem_sugerida, status")
    .eq("id", id)
    .eq("user_id", usuario.id)
    .maybeSingle();

  if (erroBusca || !sol) {
    return { erro: "Solicitação não encontrada ou acesso não autorizado." };
  }

  if (sol.status !== "pendente") {
    return { erro: `Esta solicitação já está com status '${sol.status}' e não pode ser aprovada.` };
  }

  const textoFinal = (textoEditado || sol.mensagem_sugerida || "").trim();
  if (!textoFinal) {
    return { erro: "A mensagem de follow-up não pode ser vazia." };
  }

  const agora = new Date().toISOString();
  // 2. Vinculação criptográfica SHA-256 do texto exato aprovado
  const hashAprovacao = crypto.createHash("sha256").update(textoFinal).digest("hex");

  const mudancas: Record<string, unknown> = {
    status: "aprovada",
    mensagem_aprovada: textoFinal,
    hash_aprovacao: hashAprovacao,
    aprovado_em: agora,
    aprovado_por: usuario.id,
    atualizado_em: agora,
  };

  const { error } = await supabase
    .from("solicitacoes_followup")
    .update(mudancas)
    .eq("id", id)
    .eq("user_id", usuario.id)
    .eq("status", "pendente");

  if (error) return { erro: `Não consegui aprovar o follow-up: ${error.message}` };

  revalidatePath("/followups");
  revalidatePath("/conversas");
  return { ok: true };
}

export async function rejeitarFollowup(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const id = texto(dados, "id");
  const motivo = texto(dados, "motivo") || "Descartado pelo consultor";

  if (!id) return { erro: "Follow-up não identificado." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from("solicitacoes_followup")
    .update({
      status: "rejeitada",
      rejeicao_motivo: motivo,
      atualizado_em: agora,
    })
    .eq("id", id)
    .eq("user_id", usuario.id)
    .eq("status", "pendente");

  if (error) return { erro: `Não consegui rejeitar o follow-up: ${error.message}` };

  revalidatePath("/followups");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Configuração Multiprovedor de Inteligência Artificial
------------------------------------------------------------------ */

export async function salvarConfigIA(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const provedorPrimario = texto(dados, "provedor_primario") || "gemini";
  const modeloPrimario = texto(dados, "modelo_primario") || "gemini-2.5-flash";
  const provedorSecundario = texto(dados, "provedor_secundario") || null;
  const modeloSecundario = texto(dados, "modelo_secundario") || null;
  const fallbackAtivo = dados.get("fallback_ativo") === "on" || dados.get("fallback_ativo") === "true";
  const temperatura = parseFloat(texto(dados, "temperatura")) || 0.2;
  const maxTokens = parseInt(texto(dados, "max_tokens"), 10) || 400;

  const supabase = await criarClienteServidor();
  const agora = new Date().toISOString();

  const payload = {
    user_id: usuario.id,
    provedor_primario: provedorPrimario,
    modelo_primario: modeloPrimario,
    provedor_secundario: provedorSecundario,
    modelo_secundario: modeloSecundario,
    fallback_ativo: fallbackAtivo,
    temperatura,
    max_tokens: maxTokens,
    atualizado_em: agora,
  };

  const { error } = await supabase
    .from("config_ia")
    .upsert(payload, { onConflict: "user_id" });

  if (error) return { erro: `Não consegui salvar a configuração de IA: ${error.message}` };

  revalidatePath("/ia");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Atendimento — Enviar mensagem manual do consultor
   Cria rascunho com status 'aprovado' para o motor disparar via WhatsApp.
------------------------------------------------------------------ */

export async function enviarMensagemManual(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const mensagemTexto = texto(dados, "mensagem");

  if (!idConversa || !mensagemTexto) {
    return { erro: "Conversa ou mensagem não preenchida." };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  // Insere como rascunho aprovado para o motor enviar via WhatsApp com segurança
  const { error } = await supabase.from("rascunhos").insert({
    user_id: usuario.id,
    id_conversa: idConversa,
    texto_sugerido: mensagemTexto.trim(),
    status: "aprovado",
    categoria: "consultor",
  });

  if (error) {
    return { erro: `Não consegui enfileirar mensagem: ${error.message}` };
  }

  revalidatePath("/conversas");
  revalidatePath("/fila");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Atendimento — Alternar controle humano (Assumir vs Devolver ao Vez)
------------------------------------------------------------------ */

export async function alternarControleHumano(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const assumir = texto(dados, "assumir") === "true";

  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("conversas")
    .update({
      so_voce: assumir,
      estagio: assumir ? "aguardando_voce" : "aguardando_bot",
      escalonamentos: assumir ? 1 : 0,
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao alternar controle: ${error.message}` };

  revalidatePath("/conversas");
  revalidatePath("/fila");
  return { ok: true };
}

/* ------------------------------------------------------------------
   CRM — Atualizar qualificação de lead (SPIN Selling)
------------------------------------------------------------------ */

export async function atualizarQualificacaoLead(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const qualificacao = texto(dados, "qualificacao");

  if (!idConversa || !qualificacao) {
    return { erro: "Dados incompletos para qualificação." };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("conversas")
    .update({ qualificacao })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao atualizar lead: ${error.message}` };

  revalidatePath("/conversas");
  revalidatePath("/clientes");
  revalidatePath("/visao-geral");
  return { ok: true };
}

/* ------------------------------------------------------------------
   CRM — Atualizar etapa do funil comercial (8 estágios CapitalCred)
------------------------------------------------------------------ */

export async function atualizarEtapaComercial(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const novaEtapa = texto(dados, "etapa") as Etapa;

  if (!idConversa || !novaEtapa) {
    return { erro: "Identificação da conversa ou etapa ausente." };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("conversas")
    .update({
      etapa: novaEtapa,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao atualizar etapa comercial: ${error.message}` };

  revalidatePath("/conversas");
  revalidatePath("/clientes");
  revalidatePath("/visao-geral");
  return { ok: true };
}

/* ------------------------------------------------------------------
   LGPD — Registrar Opt-Out (Descadastrar cliente por solicitação)
------------------------------------------------------------------ */

export async function registrarOptOut(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const motivo = texto(dados, "motivo") || "solicitado_pelo_consultor";

  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const agoraIso = new Date().toISOString();

  const { error } = await supabase
    .from("conversas")
    .update({
      opt_out: true,
      opt_out_em: agoraIso,
      motivo_opt_out: motivo,
      atender: false,
      seguir: false,
      etapa: "perdido",
      motivo_perda: "opt_out_lgpd",
      atualizado_em: agoraIso,
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao registrar opt-out: ${error.message}` };

  // Cancela quaisquer follow-ups em aberto para o número
  try {
    await supabase
      .from("solicitacoes_followup")
      .update({
        status: "cancelada",
        rejeicao_motivo: "Cliente em opt-out LGPD",
        atualizado_em: agoraIso,
      })
      .eq("id_conversa", idConversa)
      .in("status", ["pendente", "aprovada"]);
  } catch {}

  revalidatePath("/conversas");
  revalidatePath("/clientes");
  revalidatePath("/visao-geral");
  revalidatePath("/followups");
  return { ok: true };
}

/* ------------------------------------------------------------------
   LGPD — Reativar contato (Remover Opt-Out quando autorizado)
------------------------------------------------------------------ */

export async function removerOptOut(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");

  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from("conversas")
    .update({
      opt_out: false,
      opt_out_em: null,
      motivo_opt_out: null,
      atender: true,
      seguir: true,
      etapa: "primeiro_atendimento",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao remover opt-out: ${error.message}` };

  revalidatePath("/conversas");
  revalidatePath("/clientes");
  revalidatePath("/visao-geral");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Agente Global — Ativar / Pausar com marco temporal confiável
------------------------------------------------------------------ */

export async function alternarAgenteGlobal(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const acao = texto(dados, "acao"); // "ativar" ou "pausar"

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const agoraIso = new Date().toISOString();
  const ativo = acao === "ativar";

  // Grava marco temporal no banco (conexoes ou batimentos)
  const { error } = await supabase
    .from("conexoes")
    .update({
      agente_ativo: ativo,
      marco_ativacao: ativo ? agoraIso : null,
      atualizado_em: agoraIso,
    })
    .eq("user_id", usuario.id);

  if (error && !error.message.includes("agente_ativo")) {
    return { erro: `Erro ao alterar estado do agente: ${error.message}` };
  }

  revalidatePath("/conexao");
  revalidatePath("/conversas");
  revalidatePath("/visao-geral");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conversa — Pausar / Retomar IA Individual (IA Ativa vs IA Pausada)
------------------------------------------------------------------ */

export async function alternarPausaConversa(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const atender = dados.get("atender") === "true";

  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();

  // Se o cliente estiver em opt-out formal, a trava de compliance impede reativação sem consentimento
  if (atender) {
    const { data: conv } = await supabase
      .from("conversas")
      .select("opt_out")
      .eq("id", idConversa)
      .single();

    if (conv?.opt_out) {
      return { erro: "Cliente em opt-out LGPD. Exige reativação explícita de consentimento." };
    }
  }

  const { error } = await supabase
    .from("conversas")
    .update({
      atender,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao pausar/retomar IA: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conversa — Marcar como "Não Responder"
------------------------------------------------------------------ */

export async function marcarNaoResponder(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conversas")
    .update({
      atender: false,
      seguir: false,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao marcar não responder: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conversa — Arquivar
------------------------------------------------------------------ */

export async function arquivarConversa(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conversas")
    .update({
      etapa: "perdido",
      motivo_perda: "arquivada_pelo_operador",
      atender: false,
      seguir: false,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao arquivar conversa: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Conversa — Salvar Observação Interna
------------------------------------------------------------------ */

export async function salvarObservacaoInterna(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const observacoes = texto(dados, "observacoes");

  if (!idConversa) return { erro: "Conversa não identificada." };

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("conversas")
    .update({
      observacoes,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao salvar observação: ${error.message}` };

  revalidatePath("/conversas");
  return { ok: true };
}

/* ------------------------------------------------------------------
   Exclusão Local no Vez (NUNCA toca no WhatsApp externo)
------------------------------------------------------------------ */

export async function excluirConversaLocal(
  _anterior: Resultado,
  dados: FormData
): Promise<Resultado> {
  const idConversa = texto(dados, "id_conversa");
  const confirmacao = texto(dados, "confirmacao");

  if (!idConversa) return { erro: "Conversa não identificada." };
  if (confirmacao !== "EXCLUIR_LOCAL") {
    return { erro: "Confirmação de exclusão local obrigatória." };
  }

  let usuario;
  try {
    usuario = await exigirLogin();
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const supabase = await criarClienteServidor();
  // Exclui apenas do banco local do Vez; mensagens vinculadas sofrem cascade
  const { error } = await supabase
    .from("conversas")
    .delete()
    .eq("id", idConversa)
    .eq("user_id", usuario.id);

  if (error) return { erro: `Erro ao excluir registro local: ${error.message}` };

  revalidatePath("/conversas");
  revalidatePath("/clientes");
  revalidatePath("/visao-geral");
  return { ok: true };
}
