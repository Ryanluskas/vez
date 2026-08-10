import { log } from "./log.js";

const BATIDA_MS = 30_000;

/*
  Espelha o estado de UM numero na linha dele em `conexoes`.

  O painel roda na Vercel e nao tem como perguntar nada pra esta maquina —
  entao cada numero conta o proprio estado e bate o coracao a cada 30s. Se
  as batidas param, o painel para de dizer "ligado" naquele numero. Melhor
  mudo do que mentindo.
*/
export function criarEstado(supabase, idConexao, apelido) {
  let atual = { estado: "iniciando", qr: null, telefone: null, aparelho: null, detalhe: null };
  let relogio = null;

  async function gravar() {
    const { error } = await supabase
      .from("conexoes")
      .update({
        ...atual,
        visto_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", idConexao);

    if (error) {
      // Rede caiu ou faltou rodar o SQL. Nao derruba o motor: ele continua
      // atendendo, so o painel fica sem saber.
      log.erro(`[${apelido}] não consegui atualizar o painel: ${error.message}`);
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
