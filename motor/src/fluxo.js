import { log } from "./log.js";

/*
  Fase 2: o motor so escuta e registra. Nao classifica, nao responde,
  nao cria pendencia — isso e a Fase 3. Aqui a unica promessa e:
  nenhuma mensagem se perde e cada uma cai na conversa certa.
*/
export function criarFluxo(supabase, userId) {
  /*
    Acha (ou cria) a conversa daquele telefone e atualiza o resumo.
    Nao usa upsert de proposito: upsert reescreveria o `estagio`, e o
    estagio e o que diz se a conversa esta congelada esperando o consultor.
  */
  async function garantirConversa({ telefone, nome, ultimaMensagem }) {
    const { data: existente, error: erroDaBusca } = await supabase
      .from("conversas")
      .select("id, nome")
      .eq("telefone", telefone)
      .maybeSingle();

    if (erroDaBusca) throw new Error(`buscar conversa: ${erroDaBusca.message}`);

    if (!existente) {
      const { data: nova, error } = await supabase
        .from("conversas")
        .insert({
          user_id: userId,
          telefone,
          nome: nome ?? null,
          estagio: "aguardando_bot",
          ultima_mensagem: ultimaMensagem,
          atualizado_em: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw new Error(`criar conversa: ${error.message}`);
      log.info(`Cliente novo: ${nome ?? telefone}`);
      return nova.id;
    }

    const { error } = await supabase
      .from("conversas")
      .update({
        // So preenche o nome se ainda nao tem: o que o consultor salvou
        // na agenda vale mais que o pushname do WhatsApp.
        nome: existente.nome ?? nome ?? null,
        ultima_mensagem: ultimaMensagem,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", existente.id);

    if (error) throw new Error(`atualizar conversa: ${error.message}`);
    return existente.id;
  }

  return {
    async registrar({ telefone, nome, texto, direcao }) {
      const idConversa = await garantirConversa({
        telefone,
        nome,
        ultimaMensagem: texto,
      });

      const { error } = await supabase.from("mensagens").insert({
        user_id: userId,
        id_conversa: idConversa,
        direcao,
        texto,
      });

      if (error) throw new Error(`salvar mensagem: ${error.message}`);
      return idConversa;
    },
  };
}
