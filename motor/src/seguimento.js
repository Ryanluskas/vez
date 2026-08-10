import { decidirFollowup, MAXIMO_DE_FOLLOWUPS, horarioDecente } from "./funil.js";
import { log } from "./log.js";

/*
  ============================================================================
  O COBRADOR

  Varre as conversas que esfriaram e manda o lembrete. Este é o único lugar
  do produto onde uma mensagem sai sem passar por aprovação — decisão tomada
  de propósito, porque follow-up que espera aprovação não acontece.

  O que protege isso: os textos são fixos, escritos à mão, sem número e sem
  IA no meio. O `funil.js` decide QUANDO; aqui só se executa.
  ============================================================================
*/

const VARREDURA_MS = 10 * 60 * 1000; // 10 minutos

export function criarSeguimento({ supabase, maestro, userId }) {
  async function varrer() {
    // Fora do horário nem consulta o banco.
    if (!horarioDecente()) return;

    const { data, error } = await supabase
      .from("conversas")
      .select(
        "id, telefone, nome, etapa, estagio, atender, seguir, followups_enviados, ultimo_followup_em, ultima_recebida_em, id_conexao"
      )
      .eq("atender", true)
      .eq("seguir", true)
      .lt("followups_enviados", MAXIMO_DE_FOLLOWUPS)
      .in("etapa", ["conversando", "aguardando_documentos"])
      .limit(50);

    if (error) {
      // Coluna faltando = 06_funil.sql nao rodou. Avisa uma vez e segue.
      log.erro(`Follow-up parado: ${error.message}`);
      return;
    }

    for (const conversa of data ?? []) {
      const decisao = decidirFollowup(conversa);
      if (!decisao.seguir) continue;

      // A cobranca sai pelo mesmo numero da conversa, nunca por outro.
      const whatsapp = maestro.clientePara(conversa.id_conexao);
      if (!whatsapp) continue;

      try {
        await whatsapp.sendMessage(`${conversa.telefone}@c.us`, decisao.texto);

        const agora = new Date().toISOString();

        await supabase
          .from("conversas")
          .update({
            followups_enviados: decisao.tentativa,
            ultimo_followup_em: agora,
            ultima_mensagem: decisao.texto,
            atualizado_em: agora,
            // Terceira cobranca sem resposta: o cliente ja falou por omissao.
            ...(decisao.tentativa >= MAXIMO_DE_FOLLOWUPS ? { etapa: "perdido" } : {}),
          })
          .eq("id", conversa.id);

        await supabase.from("mensagens").insert({
          user_id: userId,
          id_conversa: conversa.id,
          direcao: "enviada",
          texto: decisao.texto,
        });

        log.info(
          `↻ follow-up ${decisao.tentativa}/${MAXIMO_DE_FOLLOWUPS} → ${conversa.nome ?? conversa.telefone}`
        );
      } catch (erro) {
        log.erro(`follow-up para ${conversa.telefone}: ${erro.message}`);
      }
    }
  }

  return {
    ligar() {
      const relogio = setInterval(() => {
        varrer().catch((e) => log.erro(`varredura de follow-up: ${e.message}`));
      }, VARREDURA_MS);
      relogio.unref?.();

      varrer().catch((e) => log.erro(`varredura de follow-up: ${e.message}`));

      return () => clearInterval(relogio);
    },
  };
}
