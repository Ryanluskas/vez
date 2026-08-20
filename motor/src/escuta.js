import { tentar } from "./resiliencia.js";
import { EVENTOS, observadorMudo } from "./observar.js";
import * as respostas from "./respostas.js";
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

export function criarEscuta({ supabase, fluxo, maestro, userId, observador = observadorMudo() }) {
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

  /*
    ==================================================================
    A FILA PARAVA DE FUNCIONAR NA DÉCIMA RESPOSTA

    Bug encontrado numa conversa real, e ele mata o produto em silêncio.

    Esta varredura pegava as 10 pendências respondidas MAIS ANTIGAS e
    pulava as que já tinham virado rascunho. Só que "já virou rascunho"
    não mudava nada no banco: a linha continuava 'respondida' para
    sempre, e continuava ocupando a janela das 10 mais antigas.

    Ou seja: assim que o consultor acumulava 10 respostas dadas na Fila,
    a janela ficava cheia de trabalho JÁ FEITO e nenhuma resposta nova
    chegava ao cliente. Nunca mais. Sem erro no log e sem alerta — ele
    responde no painel, o painel mostra tudo certo, e o cliente não
    recebe nada.

    Duas mudanças:

      MAIS NOVA PRIMEIRO. A resposta que o consultor acabou de dar é a
      que o cliente está esperando agora. Antiga que não processou já
      perdeu a hora; nova que não processa é cliente no vácuo.

      JANELA MAIOR. 10 era pequeno demais pra absorver o histórico. Com
      60 e a ordem invertida, precisaria de 60 respostas presas ao mesmo
      tempo pra travar de novo.

    O conserto definitivo é a pendência saber que terminou — um estado
    'concluida' em vez de ficar 'respondida' pra sempre. Está escrito em
    banco/21_pendencia_concluida.sql e espera aprovação, porque mexe no
    esquema do banco de produção.
    ==================================================================
  */
  async function varrerPendenciasRespondidas() {
    const { data, error } = await supabase
      .from("pendencias")
      .select("id, id_conversa, pergunta, resposta, categoria")
      .eq("status", "respondida")
      .not("resposta", "is", null)
      .order("respondida_em", { ascending: false })
      .limit(60);

    if (error || !data?.length) return;

    let feitas = 0;

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

      // Nao segura a varredura inteira num lote grande de atrasadas.
      if (++feitas >= 10) return;
    }
  }

  /* ---------- 2. rascunhos aprovados -> WhatsApp ---------- */

  async function varrerRascunhosAprovados() {
    const { data, error } = await supabase
      .from("rascunhos")
      .select("id, id_conversa, id_pendencia, texto_sugerido, categoria, automatico, origem")
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
      .select("id, telefone, nome, id_conexao, id_chat")
      .eq("id", rascunho.id_conversa)
      .single();

    if (!conversa) throw new Error("rascunho aprovado sem conversa; pulei");

    /*
      A resposta tem que sair pelo MESMO numero por onde o cliente escreveu.
      Sair por outro faz o cliente receber mensagem de um desconhecido no
      meio da conversa — e o consultor nem fica sabendo.
    */
    const whatsapp =
      maestro.clientePara(conversa.id_conexao) ?? maestro.qualquerCliente();

    if (!whatsapp) {
      throw new Error(
        `nenhum número conectado pra responder ${conversa.nome ?? conversa.telefone}; tento de novo depois`
      );
    }

    /*
      Enviar pelo id original da conversa. Reconstruir "telefone@c.us" nao
      alcanca contato que so existe como @lid — e hoje sao 97% deles.
    */
    const destino = conversa.id_chat ?? `${conversa.telefone}@c.us`;

    /*
      Envia primeiro, marca depois. Se cair a luz no meio, o pior caso e
      mandar de novo — melhor que o cliente nunca receber e ninguem notar.

      A retentativa cobre o pisco: o Chrome do WhatsApp as vezes recusa o
      primeiro envio logo depois de reconectar. Duas tentativas, e na
      segunda falha o rascunho fica como esta e a varredura tenta de novo
      em 15s — sem nunca marcar como enviado o que nao saiu.
    */
    const envio = await tentar(() => whatsapp.sendMessage(destino, rascunho.texto_sugerido), {
      nome: `envio para ${conversa.nome ?? conversa.telefone}`,
      tentativas: 2,
    });

    if (!envio.ok) {
      observador.registrar(EVENTOS.ERRO, {
        idConversa: conversa.id,
        ok: false,
        detalhe: `não consegui enviar: ${envio.erro}`,
      });
      throw new Error(`envio falhou: ${envio.erro}`);
    }

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

    /*
      Enviar não significa que o caso foi resolvido.

      O aviso de "já te respondo" também sai por aqui, e ele acontece
      JUSTAMENTE quando a conversa acabou de ser congelada pra você. Marcar
      'respondido' ali apagava o "travada com você" — a pendência continuava
      na Fila, mas a conversa sumia do filtro em Conversas.

      Com pendência aberta, o estágio fica como está.
    */
    const { count: esperandoVoce } = await supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("id_conversa", conversa.id)
      .eq("status", "aberta");

    await supabase
      .from("conversas")
      .update({
        ...((esperandoVoce ?? 0) > 0 ? {} : { estagio: "respondido" }),
        ultima_mensagem: rascunho.texto_sugerido,
        atualizado_em: agora,
      })
      .eq("id", conversa.id);

    observador.registrar(EVENTOS.ENVIADA, {
      idConversa: conversa.id,
      detalhe: rascunho.automatico
        ? `${rascunho.categoria} · sem passar por você`
        : `${rascunho.categoria} · você aprovou`,
    });

    log.destaque(`✓ Enviado para ${conversa.nome ?? conversa.telefone}`);

    /*
      Acabamos de mandar a lista de documentos: a bola passa pro cliente e o
      relogio do follow-up comeca a correr. E o unico jeito automatico de
      saber que a conversa entrou nessa etapa.
    */
    if (rascunho.categoria === "documentos") {
      await fluxo.marcarEsperandoDocumentos(conversa.id);
      log.info(`${conversa.nome ?? conversa.telefone} agora está esperando documentos.`);
    }

    /*
      ==================================================================
      SO VIRA EXEMPLO O QUE PASSOU PELOS SEUS OLHOS

      E "seus olhos" quer dizer o TEXTO, nao o dado.

      Aqui morava a raiz da linguagem robotica, e ela e um ciclo fechado.
      Quando voce responde na Fila, o rascunho nasce com origem
      'consultor' e sai sem segunda aprovacao — correto, voce ja aprovou
      o dado quando digitou. Mas a FRASE que vai pro cliente quem
      escreveu foi o modelo:

        voce digitou:  "1600"
        saiu:          "Consegui liberar 1600. Quer que eu te mande a
                        simulacao completa?"

      Voce nunca viu essa frase. E ela era gravada em `respostas_boas`
      como "o jeito do Ryan de responder valor" — e volta no proximo
      prompt como exemplo a imitar, com peso maior que os exemplos de
      fabrica.

      Medido na conta real: 15 copias de uma frase que o modelo inventou
      num teste, mais as frases do print, todas etiquetadas como estilo
      do consultor. O bot estava aprendendo a ser robo consigo mesmo, e
      a cada rodada ficava mais convicto.

      Aprende so o que ele leu de verdade:

        origem 'bot' aprovado no painel   ele leu e clicou. Aprende.
        origem 'lista' aprovado           idem. Aprende.
        origem 'consultor'                ele aprovou o NUMERO, nao a
                                          frase. NAO aprende.
        automatico                        ninguem leu. NAO aprende.
      ==================================================================
    */
    const eleLeuOTexto = !rascunho.automatico && rascunho.origem !== "consultor";
    if (eleLeuOTexto) await guardarExemplo(rascunho, conversa);
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

  /* ---------- 3. voce demorou? entao avisa o cliente ---------- */

  /*
    ==================================================================
    O AVISO SÓ EXISTE SE A ESPERA FOR LONGA

    O aviso "vou confirmar e já te retorno" saía junto com a ida pra
    Fila, sempre. Numa conversa real virou isto, três vezes:

      23:32  bot   Vou confirmar isso certinho e já te retorno.
      23:32  bot   Me manda uma foto do seu documento...

    Quinze segundos entre as duas. O consultor tinha respondido a Fila
    em catorze — e o cliente viu o bot anunciar que ia verificar e
    responder logo depois. Ninguém faz isso. Quem responde em quinze
    segundos só responde.

    Medido nas quatro últimas: 13s, 14s, 22s, 48s. Com um minuto de
    tolerância, três delas nunca precisariam do aviso.

    O aviso continua garantindo que ninguém fica no vácuo. Só que agora
    ele é o que sempre deveria ter sido: um pedido de desculpa pela
    demora, e não um anúncio antes de qualquer demora existir.
    ==================================================================
  */
  const DEMORA_QUE_MERECE_AVISO = 60_000;

  async function varrerPendenciasDemoradas() {
    const limite = new Date(Date.now() - DEMORA_QUE_MERECE_AVISO).toISOString();

    const { data, error } = await supabase
      .from("pendencias")
      .select("id, id_conversa, criado_em")
      .eq("status", "aberta")
      .lt("criado_em", limite)
      .order("criado_em", { ascending: true })
      .limit(20);

    if (error || !data?.length) return;

    for (const pendencia of data) {
      /*
        Já avisei nesta conversa depois que a pendência abriu? Então não
        aviso de novo.

        Reconheço pelo TEXTO, não por um campo: a coluna `id_pendencia`
        do rascunho é o que marca "esta pendência já virou resposta", e
        preenchê-la com um aviso faria a varredura das respondidas achar
        que o caso já foi entregue. O aviso ia matar a resposta.
      */
      const { data: recentes } = await supabase
        .from("rascunhos")
        .select("texto_sugerido")
        .eq("id_conversa", pendencia.id_conversa)
        .gte("criado_em", pendencia.criado_em)
        .limit(20);

      const jaAvisei = (recentes ?? []).some((r) =>
        respostas.ehAvisoDeQueVaiVerificar(r.texto_sugerido)
      );

      if (jaAvisei) continue;

      await fluxo.avisarSeVoceDemorou({ idConversa: pendencia.id_conversa });
    }
  }

  /* ---------- ligar ---------- */

  async function varrerTudo() {
    try {
      await varrerPendenciasRespondidas();
      await varrerPendenciasDemoradas();
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
