import { log } from "./log.js";

const BATIDA_MS = 30_000;

/*
  Espelha o estado do motor na tabela `conexoes`.
  O painel roda na Vercel e nao tem como perguntar nada pra esta maquina —
  entao o motor conta, e bate o coracao a cada 30s. Se as batidas param,
  o painel para de dizer "Motor ligado". Melhor mudo do que mentindo.
*/
export function criarEstado(supabase, userId) {
  let atual = { estado: "iniciando", qr: null, telefone: null, aparelho: null, detalhe: null };
  let relogio = null;

  async function gravar() {
    const { error } = await supabase.from("conexoes").upsert(
      {
        user_id: userId,
        ...atual,
        visto_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      // Rede caiu ou o SQL da Fase 2 nao foi rodado. Nao derruba o motor:
      // ele continua atendendo, so o painel fica sem saber.
      log.erro("Nao consegui atualizar o estado no painel:", error.message);
    }
  }

  return {
    async anotar(mudanca) {
      atual = { ...atual, ...mudanca };
      await gravar();
    },

    baterCoracao() {
      if (relogio) return;
      relogio = setInterval(gravar, BATIDA_MS);
      relogio.unref?.();
    },

    async desligar(detalhe) {
      if (relogio) clearInterval(relogio);
      relogio = null;
      atual = { ...atual, estado: "desligado", qr: null, detalhe: detalhe ?? null };
      await gravar();
    },
  };
}
