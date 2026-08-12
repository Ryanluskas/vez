import { classificar } from "./classificar.js";
import { escreverResposta, escreverComResposta } from "./redator.js";
import { exemplosComBase } from "./estilo.js";
import { log } from "./log.js";

/* Quantas mensagens vao no contexto que a IA le e que aparece no painel. */
const TAMANHO_DO_CONTEXTO = 4;

/* Quantos exemplos do "Meu jeito" entram no prompt. Mais que isso, o modelo
   pequeno perde o fio e comeca a copiar o exemplo em vez de imitar o tom. */
const EXEMPLOS_NO_PROMPT = 3;

export function criarFluxo(supabase, userId) {
  /* ------------------------------------------------------------------
     Conversa
  ------------------------------------------------------------------ */

  /*
    A conversa e identificada por (numero do consultor, telefone do cliente).
    O mesmo cliente escrevendo pro seu numero comercial e pro seu numero
    antigo sao duas conversas — historicos diferentes, etapas diferentes.
  */
  async function garantirConversa({
    idConexao,
    idChat,
    telefone,
    nome,
    ultimaMensagem,
    direcao,
  }) {
    const { data: existente, error: erroDaBusca } = await supabase
      .from("conversas")
      .select("id, nome, estagio, atender, etapa, seguir, id_chat")
      .eq("telefone", telefone)
      .eq("id_conexao", idConexao)
      .maybeSingle();

    if (erroDaBusca) throw new Error(`buscar conversa: ${erroDaBusca.message}`);

    if (!existente) {
      const { data: nova, error } = await supabase
        .from("conversas")
        .insert({
          user_id: userId,
          id_conexao: idConexao,
          id_chat: idChat ?? null,
          telefone,
          nome: nome ?? null,
          estagio: "aguardando_bot",
          ultima_mensagem: ultimaMensagem,
          ultima_direcao: direcao ?? null,
          atualizado_em: new Date().toISOString(),
        })
        .select("id, nome, estagio, atender, etapa, seguir")
        .single();

      if (error) throw new Error(`criar conversa: ${error.message}`);
      log.info(`Cliente novo: ${nome ?? telefone}`);
      return nova;
    }

    const { error } = await supabase
      .from("conversas")
      .update({
        // So preenche o nome se ainda nao tem: o que o consultor salvou
        // na agenda vale mais que o pushname do WhatsApp.
        nome: existente.nome ?? nome ?? null,
        // Conversa antiga, gravada antes do @lid, ganha o id agora.
        id_chat: existente.id_chat ?? idChat ?? null,
        ultima_mensagem: ultimaMensagem,
        ultima_direcao: direcao,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", existente.id);

    if (error) throw new Error(`atualizar conversa: ${error.message}`);
    return existente;
  }

  async function mudarEstagio(idConversa, estagio) {
    await supabase
      .from("conversas")
      .update({ estagio, atualizado_em: new Date().toISOString() })
      .eq("id", idConversa);
  }

  /* ------------------------------------------------------------------
     Leituras auxiliares
  ------------------------------------------------------------------ */

  /* Ultimas mensagens da conversa, em texto corrido, mais velha primeiro. */
  async function contextoDaConversa(idConversa) {
    const { data } = await supabase
      .from("mensagens")
      .select("direcao, texto")
      .eq("id_conversa", idConversa)
      .order("criado_em", { ascending: false })
      .limit(TAMANHO_DO_CONTEXTO);

    if (!data?.length) return null;

    return data
      .reverse()
      .map((m) => `${m.direcao === "recebida" ? "Cliente" : "Você"}: ${m.texto}`)
      .join("\n");
  }

  /*
    O coracao do few-shot: as respostas que ELE aprovou, da mesma gaveta.
    Se a gaveta ainda estiver vazia — dia 1 de uso — completa com o estilo
    de fabrica, senao o bot escreve como robo de banco na primeira semana.
  */
  async function exemplosDaCategoria(categoria) {
    const { data } = await supabase
      .from("respostas_boas")
      .select("mensagem_cliente, resposta_ryan")
      .eq("categoria", categoria)
      .order("criado_em", { ascending: false })
      .limit(EXEMPLOS_NO_PROMPT);

    return exemplosComBase(data, categoria, EXEMPLOS_NO_PROMPT);
  }

  async function jaTemPendenciaAberta(idConversa) {
    const { count } = await supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("id_conversa", idConversa)
      .eq("status", "aberta");

    return (count ?? 0) > 0;
  }

  /* ------------------------------------------------------------------
     Escrita
  ------------------------------------------------------------------ */

  async function abrirPendencia({ idConversa, pergunta, contexto, categoria, motivo }) {
    // Cliente ansioso manda tres mensagens seguidas. Isso e uma pessoa na
    // fila, nao tres — senao a ordem de chegada vira mentira.
    if (await jaTemPendenciaAberta(idConversa)) {
      log.info("Já tinha pendência aberta nessa conversa; não dupliquei.");
      return null;
    }

    const { data, error } = await supabase
      .from("pendencias")
      .insert({
        user_id: userId,
        id_conversa: idConversa,
        pergunta,
        contexto,
        categoria,
        motivo,
        status: "aberta",
      })
      .select("id")
      .single();

    if (error) throw new Error(`abrir pendencia: ${error.message}`);

    // Congela: daqui pra frente o bot nao toca nesta conversa ate voce responder.
    await mudarEstagio(idConversa, "aguardando_voce");
    return data.id;
  }

  async function abrirRascunho({ idConversa, texto, categoria, idPendencia = null }) {
    const { error } = await supabase.from("rascunhos").insert({
      user_id: userId,
      id_conversa: idConversa,
      texto_sugerido: texto,
      categoria,
      id_pendencia: idPendencia,
      status: "pendente",
    });

    if (error) throw new Error(`abrir rascunho: ${error.message}`);
    await mudarEstagio(idConversa, "rascunho_pronto");
  }

  return {
    /* Grava a mensagem crua. Vale pros dois lados da conversa. */
    async registrar({ idConexao, idChat, telefone, nome, texto, direcao }) {
      const conversa = await garantirConversa({
        idConexao,
        idChat,
        telefone,
        nome,
        ultimaMensagem: texto,
        direcao,
      });

      const { error } = await supabase.from("mensagens").insert({
        user_id: userId,
        id_conversa: conversa.id,
        direcao,
        texto,
      });

      if (error) throw new Error(`salvar mensagem: ${error.message}`);

      /*
        Cliente falou: o relogio do follow-up zera e as cobrancas anteriores
        sao perdoadas. Quem respondeu nao esta sumido, mesmo que tenha
        demorado tres dias.
      */
      if (direcao === "recebida") {
        const mudanca = {
          ultima_recebida_em: new Date().toISOString(),
          followups_enviados: 0,
        };
        if (conversa.etapa === "novo") mudanca.etapa = "conversando";

        await supabase.from("conversas").update(mudanca).eq("id", conversa.id);
        Object.assign(conversa, mudanca);
      }

      return conversa;
    },

    /*
      Chegou arquivo. Nao classifica: foto de contracheque nao tem texto pra
      classificar, e o que importa aqui e avisar o consultor de que a bola
      voltou pra ele.
    */
    async marcarDocumentoRecebido(conversa) {
      await supabase
        .from("conversas")
        .update({
          etapa: "documentos_recebidos",
          followups_enviados: 0,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", conversa.id);

      conversa.etapa = "documentos_recebidos";
    },

    /* O bot mandou a lista de documentos: agora a bola esta com o cliente. */
    async marcarEsperandoDocumentos(idConversa) {
      await supabase
        .from("conversas")
        .update({ etapa: "aguardando_documentos", followups_enviados: 0 })
        .eq("id", idConversa)
        .in("etapa", ["novo", "conversando"]);
    },

    /*
      O cerebro da Fase 3. Roda depois de gravar uma mensagem RECEBIDA.

      Ordem: congelada? -> classifica -> ou abre pendencia, ou escreve rascunho.
      Todo caminho de erro cai na fila. Nenhum caminho manda mensagem sozinho.
    */
    async processarRecebida(conversa, texto, nomeCliente) {
      /*
        Silenciada na mao pelo consultor: nao e cliente. A mensagem ja foi
        gravada la em cima — o historico nunca se perde — mas o cerebro nao
        roda. E o unico jeito honesto de separar cliente de mae, porque pro
        WhatsApp os dois sao o mesmo tipo de contato.
      */
      if (conversa.atender === false) {
        log.info(`${nomeCliente ?? "contato"} está silenciado. Só gravei.`);
        return;
      }

      // Conversa congelada esperando o consultor: nao mexe. O cliente pode
      // mandar mais dez mensagens; elas ficam gravadas e o bot fica quieto.
      if (conversa.estagio === "aguardando_voce") {
        log.info("Conversa congelada esperando você. Bot não respondeu.");
        return;
      }

      /*
        Cliente ansioso manda tres mensagens em dois segundos. As tres leem
        o estagio ANTES de a primeira congelar a conversa, entao as tres
        passavam pelo teste acima e rodavam classificacao completa — tres
        chamadas de IA numa maquina que atende uma por vez, e as duas
        ultimas estouravam o tempo limite esperando.

        Perguntar direto ao banco custa uma consulta e economiza minutos.
      */
      if (await jaTemPendenciaAberta(conversa.id)) {
        log.info("Já tem pendência aberta nessa conversa; não classifiquei de novo.");
        return;
      }

      const contexto = await contextoDaConversa(conversa.id);
      const { categoria, precisaDoRyan, motivo, decidiuNaRegra } = await classificar({
        texto,
        contexto,
      });

      if (precisaDoRyan) {
        await abrirPendencia({
          idConversa: conversa.id,
          pergunta: texto,
          contexto,
          categoria,
          motivo,
        });
        log.destaque(
          `→ FILA  ${nomeCliente ?? ""} · ${motivo}${decidiuNaRegra ? " (regra rígida)" : ""}`
        );
        return;
      }

      const exemplos = await exemplosDaCategoria(categoria);
      const rascunho = await escreverResposta({
        mensagemCliente: texto,
        nomeCliente,
        contexto,
        exemplos,
      });

      // O bot achou que sabia, mas na hora de escrever nao soube sem chutar.
      // Isso nao e falha: e o produto funcionando. Vai pra fila.
      if (!rascunho) {
        await abrirPendencia({
          idConversa: conversa.id,
          pergunta: texto,
          contexto,
          categoria,
          motivo: "o bot não soube responder sem chutar",
        });
        log.info(`→ fila  ${nomeCliente ?? ""} · o bot não soube escrever`);
        return;
      }

      await abrirRascunho({ idConversa: conversa.id, texto: rascunho, categoria });
      log.info(`→ rascunho  ${nomeCliente ?? ""} · ${categoria}`);
    },

    /*
      Voce respondeu uma pendencia no painel. O motor pega a sua resposta,
      escreve no seu tom e deixa como rascunho pra voce aprovar.
      A conversa sai do congelamento aqui.
    */
    async transformarRespostaEmRascunho(pendencia) {
      const { data: conversa } = await supabase
        .from("conversas")
        .select("id, nome")
        .eq("id", pendencia.id_conversa)
        .single();

      const exemplos = await exemplosDaCategoria(pendencia.categoria ?? "outro");

      const texto = await escreverComResposta({
        mensagemCliente: pendencia.pergunta,
        respostaDoConsultor: pendencia.resposta,
        nomeCliente: conversa?.nome,
        exemplos,
      });

      await abrirRascunho({
        idConversa: pendencia.id_conversa,
        texto,
        categoria: pendencia.categoria ?? "outro",
        idPendencia: pendencia.id,
      });

      log.destaque(`Rascunho pronto para ${conversa?.nome ?? "cliente"}. Aprove no painel.`);
    },

    /*
      Fase 5. Toda resposta aprovada vira exemplo. E assim que o bot aprende
      o jeito de falar, sem treinar nada e sem custo.
    */
    async guardarComoExemploBom({ categoria, mensagemCliente, respostaAprovada }) {
      if (!categoria || !mensagemCliente || !respostaAprovada) return;

      const { error } = await supabase.from("respostas_boas").insert({
        user_id: userId,
        categoria,
        mensagem_cliente: mensagemCliente,
        resposta_ryan: respostaAprovada,
      });

      if (error) log.erro(`não consegui guardar o exemplo: ${error.message}`);
      else log.info(`Aprendi mais um jeito seu de responder "${categoria}".`);
    },

    contextoDaConversa,
    mudarEstagio,
  };
}
