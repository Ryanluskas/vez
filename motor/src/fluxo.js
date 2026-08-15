import { classificar } from "./classificar.js";
import { escreverResposta, escreverComResposta, escreverPedido } from "./redator.js";
import { criarMemoria } from "./memoria.js";
import { montarPedido, REQUISITOS } from "./requisitos.js";
import { exemplosComBase } from "./estilo.js";
import { log } from "./log.js";

/* Quantas mensagens vao no contexto que a IA le e que aparece no painel. */
const TAMANHO_DO_CONTEXTO = 4;

/* Quantos exemplos do "Meu jeito" entram no prompt. Mais que isso, o modelo
   pequeno perde o fio e comeca a copiar o exemplo em vez de imitar o tom. */
const EXEMPLOS_NO_PROMPT = 3;

export function criarFluxo(supabase, userId) {
  const memoria = criarMemoria(supabase, userId);

  /* O bot mandou a lista de documentos: a bola passa pro cliente. */
  async function marcarEsperandoDocumentos(idConversa) {
    await supabase
      .from("conversas")
      .update({ etapa: "aguardando_documentos", followups_enviados: 0 })
      .eq("id", idConversa)
      .in("etapa", ["novo", "conversando"]);
  }

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

  /*
    O que o bot sabe sobre a operacao. Entra em todo prompt, entao vale
    guardar por alguns minutos em vez de consultar o banco a cada mensagem —
    isso muda uma vez por mes, nao uma vez por segundo.
  */
  let manualGuardado = null;
  let manualEm = 0;
  const VALIDADE_DO_MANUAL = 5 * 60 * 1000;

  async function manualDaOperacao() {
    if (manualGuardado !== null && Date.now() - manualEm < VALIDADE_DO_MANUAL) {
      return manualGuardado;
    }

    const { data, error } = await supabase
      .from("conhecimento")
      .select("assunto, conteudo")
      .order("ordem")
      .order("criado_em");

    // Tabela ainda nao criada: segue sem manual, sem derrubar nada.
    manualGuardado = error
      ? ""
      : (data ?? []).map((f) => `${f.assunto}: ${f.conteudo}`).join("\n");
    manualEm = Date.now();
    return manualGuardado;
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

  /*
    O consultor abre a Fila entre dois atendimentos. "Cliente precisa de
    você" não serve: ele teria que abrir a conversa, ler tudo e reconstruir
    o caso na cabeça. O que ele precisa é do dossiê pronto e da pergunta
    exata — pra responder só o número e voltar ao que estava fazendo.
  */
  function montarDossie(memoriaDoCliente, contexto) {
    const linhas = [];

    if (memoriaDoCliente) {
      const m = memoriaDoCliente;
      if (m.convenio) linhas.push(`Convênio: ${m.convenio}`);
      if (m.banco) linhas.push(`Banco: ${m.banco}`);
      if (m.objetivo) linhas.push(`Quer: ${m.objetivo.replace(/_/g, " ")}`);

      const entregues = Object.entries(m.coletado ?? {})
        .filter(([, v]) => v?.confirmado)
        .map(([k]) => REQUISITOS[k]?.rotulo ?? k);
      if (entregues.length) linhas.push(`Já enviou: ${entregues.join(", ")}`);
    }

    const cabecalho = linhas.length ? `${linhas.join("\n")}\n\n` : "";
    return `${cabecalho}${contexto ?? ""}`.trim() || null;
  }

  async function abrirPendencia({
    idConversa,
    pergunta,
    contexto,
    categoria,
    motivo,
    memoria: memoriaDoCliente = null,
  }) {
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
        contexto: montarDossie(memoriaDoCliente, contexto),
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

  /*
    Modo autonomo. Guardado por alguns minutos como o manual: muda raramente
    e seria uma consulta por mensagem.
  */
  let prefsGuardadas = null;
  let prefsEm = 0;

  async function preferencias() {
    if (prefsGuardadas && Date.now() - prefsEm < VALIDADE_DO_MANUAL) {
      return prefsGuardadas;
    }

    const { data, error } = await supabase
      .from("preferencias")
      .select("modo_autonomo, categorias")
      .maybeSingle();

    // Tabela nao criada ou linha inexistente: modo aprovacao, o seguro.
    prefsGuardadas =
      error || !data ? { modo_autonomo: false, categorias: [] } : data;
    prefsEm = Date.now();
    return prefsGuardadas;
  }

  /*
    Pode sair sem passar por voce?

    'valor' NUNCA, mesmo que apareca na lista — e a ultima barreira antes do
    envio, depois da regra rigida, do redator e da conferencia de numeros.
    Defesa em profundidade: cada camada assume que a anterior falhou.
  */
  async function podeSairSozinho(categoria) {
    if (categoria === "valor") return false;
    const p = await preferencias();
    return p.modo_autonomo && (p.categorias ?? []).includes(categoria);
  }

  /*
    Pede ao cliente o que falta. A mensagem é escrita pelo redator para sair
    no tom do consultor, mas o CONTEÚDO do pedido vem de requisitos.js —
    código, não modelo. Assim o bot nunca pede algo que já tem, nem inventa
    um documento que a operação não usa.
  */
  async function pedirAoCliente({ conversa, nomeCliente, pedido, contexto, porque }) {
    const lembrado = await memoria.ler(conversa.id);

    const texto = await escreverPedido({
      pedido: pedido.texto,
      mensagemCliente: porque,
      nomeCliente: lembrado?.nome ?? nomeCliente,
      contexto,
      exemplos: await exemplosDaCategoria("documentos"),
      manual: await manualDaOperacao(),
      memoria: memoria.emTexto(lembrado),
    });

    // Redator falhou: manda o pedido cru, que já é uma frase inteira.
    const mensagem = texto ?? `Oi! Pra eu continuar, ${pedido.texto}.`;

    await memoria.registrarPergunta(conversa.id, pedido.chaves);
    await memoria.registrarAcao(
      conversa.id,
      "ask_customer",
      `falta ${pedido.chaves.join(", ")}`
    );

    const sozinho = await abrirRascunho({
      idConversa: conversa.id,
      texto: mensagem,
      categoria: "documentos",
    });

    await marcarEsperandoDocumentos(conversa.id);

    log.destaque(
      `→ ${sozinho ? "PEDINDO AO CLIENTE" : "rascunho de pedido"}  ` +
        `${nomeCliente ?? ""} · falta ${pedido.chaves.join(", ")}`
    );
  }

  async function abrirRascunho({ idConversa, texto, categoria, idPendencia = null }) {
    const automatico = await podeSairSozinho(categoria);

    const { error } = await supabase.from("rascunhos").insert({
      user_id: userId,
      id_conversa: idConversa,
      texto_sugerido: texto,
      categoria,
      id_pendencia: idPendencia,
      // Aprovado de saida: a escuta pega e envia no proximo ciclo.
      status: automatico ? "aprovado" : "pendente",
      automatico,
    });

    if (error) throw new Error(`abrir rascunho: ${error.message}`);
    await mudarEstagio(idConversa, "rascunho_pronto");
    return automatico;
  }

  return {
    /* Grava a mensagem crua. Vale pros dois lados da conversa. */
    async registrar({ idConexao, idChat, idMensagem, telefone, nome, texto, direcao }) {
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
        id_whatsapp: idMensagem ?? null,
        direcao,
        texto,
      });

      /*
        23505 = o indice unico em id_whatsapp barrou. O WhatsApp reentrega
        evento — reconexao, aba recarregada, sincronia do celular — e sem
        isto o bot responderia duas vezes a mesma pergunta. Quem chamou ve
        `jaVista` e para aqui.
      */
      if (error?.code === "23505") {
        log.info("Mensagem repetida do WhatsApp; ignorei.");
        return { ...conversa, jaVista: true };
      }

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

    marcarEsperandoDocumentos,
    memoria,

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

      /*
        Lê a mensagem e guarda o que der: nome, convênio, banco, objetivo.
        Só chama a IA se ainda falta algo — quem já disse que é do INSS não
        precisa ser interpretado de novo.
      */
      let lembrado = await memoria.garantir(conversa.id);
      const novosFatos = await memoria.extrairDaMensagem(texto, lembrado);
      if (Object.values(novosFatos).some(Boolean)) {
        lembrado = await memoria.aprender(conversa.id, novosFatos);
      }

      const { categoria, precisaDoRyan, motivo, decidiuNaRegra } = await classificar({
        texto,
        contexto,
      });

      if (precisaDoRyan) {
        /*
          AQUI ESTÁ A MUDANÇA QUE FAZ O BOT TRABALHAR SOZINHO.

          Antes, toda pergunta de dinheiro virava pendência na hora. Mas
          "quanto libera?" sem contracheque na mão não é pergunta pro
          consultor — é pergunta que ninguém pode responder ainda. Chamar
          ele ali só transfere o trabalho de pedir documento.

          Agora: se falta informação do CLIENTE, o bot pede ao cliente. Só
          quando estiver tudo na mão é que o consultor entra — e aí entra
          para fazer a única coisa que só ele faz, que é a simulação.

          Isso não fura a regra de ouro: o que sai é uma pergunta, sem
          número nenhum, e passa pelas mesmas validações de sempre.
        */
        const pedido = montarPedido(lembrado);

        if (pedido) {
          await pedirAoCliente({
            conversa,
            nomeCliente,
            pedido,
            contexto,
            porque: texto,
          });
          return;
        }

        await abrirPendencia({
          idConversa: conversa.id,
          pergunta: texto,
          contexto,
          categoria,
          motivo,
          memoria: lembrado,
        });
        await memoria.registrarAcao(conversa.id, "ask_human", motivo);
        log.destaque(
          `→ FILA  ${nomeCliente ?? ""} · ${motivo}${decidiuNaRegra ? " (regra rígida)" : ""}`
        );
        return;
      }

      const exemplos = await exemplosDaCategoria(categoria);
      const rascunho = await escreverResposta({
        mensagemCliente: texto,
        nomeCliente: lembrado?.nome ?? nomeCliente,
        contexto,
        exemplos,
        manual: await manualDaOperacao(),
        memoria: memoria.emTexto(lembrado),
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

      const sozinho = await abrirRascunho({
        idConversa: conversa.id,
        texto: rascunho,
        categoria,
      });

      log.info(
        sozinho
          ? `→ RESPONDENDO  ${nomeCliente ?? ""} · ${categoria} · sem passar por você`
          : `→ rascunho  ${nomeCliente ?? ""} · ${categoria}`
      );
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
        manual: await manualDaOperacao(),
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
