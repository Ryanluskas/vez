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

const MAXIMO_DE_CONVERSAS = 200;
const MENSAGENS_POR_CONVERSA = 40;

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

export async function importarHistorico({
  supabase,
  cliente,
  userId,
  idConexao,
  apelido,
  dias,
}) {
  const corte = Date.now() - dias * 24 * 60 * 60 * 1000;
  log.info(`[${apelido}] importando os últimos ${dias} dia(s)…`);

  const conversasDoWhats = await cliente.getChats();

  const interessantes = conversasDoWhats
    .filter(
      (c) =>
        !c.isGroup &&
        String(c.id?._serialized ?? "").endsWith("@c.us") &&
        (c.timestamp ?? 0) * 1000 >= corte
    )
    .slice(0, MAXIMO_DE_CONVERSAS);

  let novasConversas = 0;
  let mensagensGravadas = 0;
  let esperandoVoce = 0;

  for (const chat of interessantes) {
    try {
      const telefone = chat.id._serialized.replace("@c.us", "");
      const mensagens = (await chat.fetchMessages({ limit: MENSAGENS_POR_CONVERSA }))
        .filter((m) => (m.timestamp ?? 0) * 1000 >= corte)
        .filter((m) => !m.isStatus);

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
            telefone,
            nome: chat.name || null,
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
          .update({ ultima_direcao: ultimaDirecao })
          .eq("id", idConversa);
      }

      /* ---- as mensagens ---- */
      const linhas = mensagens
        .map((m) => ({
          user_id: userId,
          id_conversa: idConversa,
          id_whatsapp: m.id?._serialized ?? null,
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
  }

  log.destaque(
    `[${apelido}] importei ${novasConversas} conversa(s) nova(s) e ${mensagensGravadas} mensagem(ns).\n` +
      `   ${esperandoVoce} pessoa(s) falaram por último e não foram respondidas.\n` +
      `   Nada foi respondido: veja em Conversas e decida o que fazer.`
  );

  return { novasConversas, mensagensGravadas, esperandoVoce };
}
