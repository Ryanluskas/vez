import { log } from "./log.js";

/*
  ============================================================================
  TRAZER O PASSADO PRA DENTRO

  O motor só enxerga o que chega depois que ele liga. Quem escreveu ontem,
  com o computador desligado, não existe pro produto — e é justamente aí que
  mora o cliente esquecido.

  A REGRA DESTE ARQUIVO: importar não responde nada.

  Nenhuma mensagem é classificada, nenhum rascunho é escrito, nenhuma
  cobrança sai. As conversas entram como 'novo', etapa que o follow-up não
  toca. Se importar disparasse o cérebro, o consultor mandaria dezenas de
  mensagens sem contexto pra gente que falou com ele semana passada — e
  queimaria a lista inteira num clique.
  ============================================================================
*/

const MENSAGENS_POR_CONVERSA = 40;

/* De quantas em quantas conversas o painel é avisado do progresso. */
const AVISAR_A_CADA = 5;

/* Mesmo mapa do whatsapp.js: mensagem sem texto ainda é informação. */
const RECADO_POR_TIPO = {
  image: "[imagem]",
  video: "[vídeo]",
  audio: "[áudio]",
  ptt: "[áudio]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  vcard: "[contato]",
  multi_vcard: "[contatos]",
  revoked: "[mensagem apagada]",
};

function textoDaMensagem(msg) {
  const corpo = (msg.body ?? "").trim();
  const recado = RECADO_POR_TIPO[msg.type];
  if (!recado) return corpo;
  return corpo ? `${recado} ${corpo}` : recado;
}

/*
  Erro que vem de dentro da pagina do WhatsApp chega minificado: a mensagem
  e literalmente "r". Isso apareceu em producao e nao dizia nada. Aqui a
  gente extrai tudo que da pra extrair antes de reportar.
*/
function descreverErro(erro) {
  if (!erro) return "erro sem descrição";
  const partes = [erro.name, erro.message].filter(Boolean).join(": ");
  if (partes.length > 3) return partes;

  // Mensagem inútil ("r"): tenta a primeira linha útil da pilha.
  const pilha = String(erro.stack ?? "").split("\n").slice(0, 3).join(" | ");
  return `${partes || "erro"} (${pilha || "sem pilha"})`;
}

/*
  Listar conversas e a parte mais fragil da lib: ela depende de nomes
  internos do WhatsApp Web, que mudam sem aviso. Por isso tres caminhos,
  do mais suportado pro mais cru, e o log diz qual funcionou — quando o
  primeiro quebrar de novo, a informacao ja esta na tela.
*/
async function listarConversas(cliente, apelido) {
  const tentativas = [
    {
      /*
        O caminho que funciona. Le a colecao crua e extrai so os 4 campos
        que interessam.

        O getChats() da lib usa a MESMA colecao, mas depois passa cada chat
        por getChatModel(), que serializa tudo e chama coisas que o WhatsApp
        mudou — e falha com um erro minificado ("r"). Como aqui nao se
        serializa nada, a mudanca nao afeta.
      */
      nome: "coleção do WhatsApp",
      async rodar() {
        return await cliente.pupPage.evaluate(() => {
          const col = window.require("WAWebCollections");
          return col.Chat.getModelsArray().map((c) => {
            const id = c.id?._serialized ?? null;

            // Com @lid o telefone nao esta no id: vem do contato.
            const doContato =
              c.contact?.phoneNumber?._serialized ??
              c.contact?.phoneNumber ??
              null;

            const nomeCru = c.name ?? c.formattedTitle ?? null;

            return {
              id,
              // "+55 96 9907-2152" e telefone formatado, nao nome.
              nome: nomeCru && !/^\+?[\d\s()-]+$/.test(nomeCru) ? nomeCru : null,
              telefone: String(doContato ?? id ?? "").replace(/@.*$/, ""),
              timestamp: c.t ?? 0,
              naoLidas: c.unreadCount ?? 0,
              ehGrupo: !!c.isGroup,
            };
          });
        });
      },
    },
    {
      nome: "getChats da biblioteca",
      async rodar() {
        const chats = await cliente.getChats();
        return chats.map((c) => ({
          id: c.id?._serialized,
          nome: c.name ?? null,
          telefone: String(c.id?.user ?? ""),
          timestamp: c.timestamp ?? 0,
          naoLidas: c.unreadCount ?? 0,
          ehGrupo: !!c.isGroup,
        }));
      },
    },
  ];

  const problemas = [];

  for (const tentativa of tentativas) {
    try {
      const lista = await tentativa.rodar();
      if (Array.isArray(lista) && lista.length) {
        log.info(`[${apelido}] li a lista de conversas via ${tentativa.nome}.`);
        return lista.filter((c) => c.id);
      }
      problemas.push(`${tentativa.nome}: veio vazio`);
    } catch (erro) {
      problemas.push(`${tentativa.nome}: ${descreverErro(erro)}`);
    }
  }

  throw new Error(`não consegui listar suas conversas. ${problemas.join(" · ")}`);
}

/*
  Mesma fragilidade da listagem: buscar mensagem depende de nome interno.
  Dois caminhos, e devolve sempre o mesmo formato simples pro resto do
  arquivo não precisar saber por onde veio.
*/
/*
  Mensagens pela mesma coleção. Traz o que o WhatsApp já tem carregado na
  conversa — que é o histórico recente, exatamente o que interessa aqui.
*/
async function buscarMensagens(cliente, idChat) {
  return await cliente.pupPage.evaluate(
    (id, limite) => {
      const col = window.require("WAWebCollections");
      const chat = col.Chat.get(id);
      if (!chat) return [];

      const modelos = chat.msgs?.getModelsArray?.() ?? [];
      return modelos
        .slice(-limite)
        .filter((m) => !m.isStatusV3)
        .map((m) => ({
          id: m.id?._serialized ?? null,
          fromMe: !!m.id?.fromMe,
          timestamp: m.t ?? 0,
          type: m.type,
          body: m.body ?? m.caption ?? "",
        }));
    },
    idChat,
    MENSAGENS_POR_CONVERSA
  );
}

export async function importarHistorico({
  supabase,
  cliente,
  userId,
  idConexao,
  apelido,
  dias,
  filtro = "todas",
  aoAvancar,
}) {
  const corte = Date.now() - dias * 24 * 60 * 60 * 1000;
  log.info(`[${apelido}] lendo as conversas do WhatsApp…`);

  const conversasDoWhats = await listarConversas(cliente, apelido);

  /*
    Só conversa de pessoa. @lid é o identificador novo do WhatsApp — nesta
    conta são 102 de 105. Filtrar só por @c.us descartaria quase tudo.
  */
  let interessantes = conversasDoWhats.filter(
    (c) =>
      !c.ehGrupo &&
      (String(c.id).endsWith("@c.us") || String(c.id).endsWith("@lid")) &&
      c.timestamp * 1000 >= corte
  );

  /*
    "sem_resposta" usa o contador de nao lidas do proprio WhatsApp — e o
    mesmo criterio da bolinha verde que o consultor ja enxerga no celular.
    Sem cap artificial: quem tem 800 conversas nao pode perder 600 sem saber
    quais. O que limita e o periodo e o filtro, escolhidos por ele.
  */
  if (filtro === "sem_resposta") {
    interessantes = interessantes.filter((c) => c.naoLidas > 0);
  }

  const total = interessantes.length;
  log.info(
    `[${apelido}] ${total} conversa(s) no período` +
      (filtro === "sem_resposta" ? " sem resposta sua" : "") +
      `. Importando…`
  );
  await aoAvancar?.({ total, feitas: 0 });

  let novasConversas = 0;
  let mensagensGravadas = 0;
  let esperandoVoce = 0;
  let feitas = 0;

  for (const chat of interessantes) {
    try {
      const telefone = chat.telefone || String(chat.id).replace(/@.*$/, "");
      const mensagens = (await buscarMensagens(cliente, chat.id)).filter(
        (m) => m.timestamp * 1000 >= corte
      );

      if (mensagens.length === 0) continue;

      const ultima = mensagens[mensagens.length - 1];
      const ultimaDirecao = ultima.fromMe ? "enviada" : "recebida";
      const ultimaRecebida = [...mensagens].reverse().find((m) => !m.fromMe);

      /* ---- a conversa ---- */
      const { data: existente } = await supabase
        .from("conversas")
        .select("id")
        .eq("telefone", telefone)
        .eq("id_conexao", idConexao)
        .maybeSingle();

      let idConversa = existente?.id;

      if (!idConversa) {
        const { data: nova, error } = await supabase
          .from("conversas")
          .insert({
            user_id: userId,
            id_conexao: idConexao,
            id_chat: chat.id,
            telefone,
            nome: chat.nome || null,
            /*
              'novo' de proposito: e a unica etapa que o follow-up ignora.
              Historico importado nao pode virar cobranca automatica.
            */
            etapa: "novo",
            estagio: "aguardando_bot",
            ultima_mensagem: textoDaMensagem(ultima).slice(0, 400),
            ultima_direcao: ultimaDirecao,
            ultima_recebida_em: ultimaRecebida
              ? new Date(ultimaRecebida.timestamp * 1000).toISOString()
              : null,
            atualizado_em: new Date((ultima.timestamp ?? 0) * 1000).toISOString(),
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        idConversa = nova.id;
        novasConversas++;
      } else {
        await supabase
          .from("conversas")
          .update({ ultima_direcao: ultimaDirecao, id_chat: chat.id })
          .eq("id", idConversa);
      }

      /* ---- as mensagens ---- */
      const linhas = mensagens
        .map((m) => ({
          user_id: userId,
          id_conversa: idConversa,
          id_whatsapp: m.id ?? null,
          direcao: m.fromMe ? "enviada" : "recebida",
          texto: textoDaMensagem(m),
          criado_em: new Date((m.timestamp ?? 0) * 1000).toISOString(),
        }))
        .filter((l) => l.texto && l.id_whatsapp);

      if (linhas.length) {
        /*
          ignoreDuplicates: o consultor VAI importar duas vezes. O indice
          unico em id_whatsapp segura, e aqui a segunda passada nao vira erro.
        */
        const { error } = await supabase
          .from("mensagens")
          .upsert(linhas, { onConflict: "user_id,id_whatsapp", ignoreDuplicates: true });

        if (!error) mensagensGravadas += linhas.length;
      }

      if (ultimaDirecao === "recebida") esperandoVoce++;
    } catch (erro) {
      // Uma conversa problematica nao pode abortar a importacao inteira.
      log.erro(`[${apelido}] pulei uma conversa: ${erro.message}`);
    }

    feitas++;
    if (feitas % AVISAR_A_CADA === 0 || feitas === total) {
      await aoAvancar?.({ total, feitas });
      log.info(`[${apelido}] ${feitas}/${total} conversas`);
    }
  }

  log.destaque(
    `[${apelido}] importei ${novasConversas} conversa(s) nova(s) e ${mensagensGravadas} mensagem(ns).\n` +
      `   ${esperandoVoce} pessoa(s) falaram por último e não foram respondidas.\n` +
      `   Nada foi respondido: veja em Conversas e decida o que fazer.`
  );

  return { novasConversas, mensagensGravadas, esperandoVoce };
}
