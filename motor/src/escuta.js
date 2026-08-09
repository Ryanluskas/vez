import { log } from "./log.js";

/*
  O motor tambem escuta o painel, nao so o WhatsApp.

  Duas filas de trabalho vem de la:
    1. pendencia que voce acabou de responder  -> vira rascunho no seu tom
    2. rascunho que voce aprovou               -> vai pro WhatsApp do cliente

  Realtime pra ser instantaneo, e uma varredura a cada 15s como rede de
  seguranca: se o socket cair enquanto voce aprova, nada fica preso.
*/

const VARREDURA_MS = 15_000;

export function criarEscuta({ supabase, fluxo, whatsapp, userId }) {
  // Ids em processamento agora. Sem isso, o realtime e a varredura podem
  // pegar a mesma linha ao mesmo tempo e a cliente recebe a mensagem duas vezes.
  const naMao = new Set();

  async function comTrava(id, tarefa) {
    if (naMao.has(id)) return;
    naMao.add(id);
    try {
      await tarefa();
    } catch (erro) {
      log.erro(erro.message);
    } finally {
      naMao.delete(id);
    }
  }

  /* ---------- 1. pendencias respondidas -> rascunho ---------- */

  async function varrerPendenciasRespondidas() {
    const { data, error } = await supabase
      .from("pendencias")
      .select("id, id_conversa, pergunta, resposta, categoria")
      .eq("status", "respondida")
      .not("resposta", "is", null)
      .order("respondida_em", { ascending: true })
      .limit(10);

    if (error || !data?.length) return;

    for (const pendencia of data) {
      // Ja virou rascunho? Entao essa ja foi tratada.
      const { count } = await supabase
        .from("rascunhos")
        .select("id", { count: "exact", head: true })
        .eq("id_pendencia", pendencia.id);

      if ((count ?? 0) > 0) continue;

      await comTrava(pendencia.id, () =>
        fluxo.transformarRespostaEmRascunho(pendencia)
      );
    }
  }

  /* ---------- 2. rascunhos aprovados -> WhatsApp ---------- */

  async function varrerRascunhosAprovados() {
    const { data, error } = await supabase
      .from("rascunhos")
      .select("id, id_conversa, id_pendencia, texto_sugerido, categoria")
      .eq("status", "aprovado")
      .is("enviado_em", null)
      .order("criado_em", { ascending: true })
      .limit(10);

    if (error || !data?.length) return;

    for (const rascunho of data) {
      await comTrava(rascunho.id, () => enviar(rascunho));
    }
  }

  async function enviar(rascunho) {
    const { data: conversa } = await supabase
      .from("conversas")
      .select("id, telefone, nome")
      .eq("id", rascunho.id_conversa)
      .single();

    if (!conversa) throw new Error("rascunho aprovado sem conversa; pulei");

    const destino = `${conversa.telefone}@c.us`;

    // Envia primeiro, marca depois. Se cair a luz no meio, o pior caso e
    // mandar de novo — melhor que o cliente nunca receber e ninguem notar.
    await whatsapp.sendMessage(destino, rascunho.texto_sugerido);

    const agora = new Date().toISOString();

    await supabase
      .from("rascunhos")
      .update({ enviado_em: agora })
      .eq("id", rascunho.id);

    await supabase.from("mensagens").insert({
      user_id: userId,
      id_conversa: conversa.id,
      direcao: "enviada",
      texto: rascunho.texto_sugerido,
    });

    await supabase
      .from("conversas")
      .update({
        estagio: "respondido",
        ultima_mensagem: rascunho.texto_sugerido,
        atualizado_em: agora,
      })
      .eq("id", conversa.id);

    log.destaque(`✓ Enviado para ${conversa.nome ?? conversa.telefone}`);

    // Fase 5: so vira exemplo o que realmente saiu. Rascunho descartado
    // nao ensina nada, e rascunho aprovado que falhou no envio tambem nao.
    await guardarExemplo(rascunho, conversa);
  }

  async function guardarExemplo(rascunho, conversa) {
    let mensagemCliente = null;

    if (rascunho.id_pendencia) {
      const { data } = await supabase
        .from("pendencias")
        .select("pergunta")
        .eq("id", rascunho.id_pendencia)
        .single();
      mensagemCliente = data?.pergunta ?? null;
    } else {
      const { data } = await supabase
        .from("mensagens")
        .select("texto")
        .eq("id_conversa", conversa.id)
        .eq("direcao", "recebida")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      mensagemCliente = data?.texto ?? null;
    }

    await fluxo.guardarComoExemploBom({
      categoria: rascunho.categoria,
      mensagemCliente,
      respostaAprovada: rascunho.texto_sugerido,
    });
  }

  /* ---------- ligar ---------- */

  async function varrerTudo() {
    try {
      await varrerPendenciasRespondidas();
      await varrerRascunhosAprovados();
    } catch (erro) {
      log.erro(`varredura: ${erro.message}`);
    }
  }

  return {
    ligar() {
      const canal = supabase
        .channel("vez:motor")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "pendencias" },
          () => varrerPendenciasRespondidas().catch((e) => log.erro(e.message))
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rascunhos" },
          () => varrerRascunhosAprovados().catch((e) => log.erro(e.message))
        )
        .subscribe();

      const relogio = setInterval(varrerTudo, VARREDURA_MS);
      relogio.unref?.();

      // Uma varredura no boot: pega o que voce aprovou com o motor desligado.
      varrerTudo();

      return () => {
        clearInterval(relogio);
        supabase.removeChannel(canal);
      };
    },
  };
}
