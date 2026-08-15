import { classificar } from "./classificar.js";
import { escreverResposta, escreverComResposta, escreverPedido } from "./redator.js";
import { criarMemoria } from "./memoria.js";
import { REQUISITOS } from "./requisitos.js";
import { decidir, podeAgirSozinho, ACOES } from "./agente/decidir.js";
import { validarDecisao } from "./agente/validar.js";
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
      .select("id, nome, estagio, atender, etapa, seguir, id_chat, escalonamentos, so_voce")
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
        .select("id, nome, estagio, atender, etapa, seguir, escalonamentos, so_voce")
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
      .select("modo, modo_autonomo, categorias")
      .maybeSingle();

    // Tabela nao criada ou linha inexistente: modo manual, o seguro.
    if (error || !data) {
      prefsGuardadas = { modo: "manual", categorias: [] };
    } else {
      prefsGuardadas = {
        // Banco sem o 15_modos ainda: deriva do interruptor antigo.
        modo: data.modo ?? (data.modo_autonomo ? "autonomo" : "manual"),
        categorias: data.categorias ?? [],
      };
    }

    prefsEm = Date.now();
    return prefsGuardadas;
  }

  /* Últimas mensagens só com a direção: é o que o anti-loop precisa. */
  async function ultimasDirecoes(idConversa) {
    const { data } = await supabase
      .from("mensagens")
      .select("direcao")
      .eq("id_conversa", idConversa)
      .order("criado_em", { ascending: false })
      .limit(6);

    return (data ?? []).reverse();
  }

  /*
    Pode sair sem passar por voce?

    'valor' NUNCA, mesmo que apareca na lista — e a ultima barreira antes do
    envio, depois da regra rigida, do redator e da conferencia de numeros.
    Defesa em profundidade: cada camada assume que a anterior falhou.
  */
  async function podeSairSozinho(categoria, confianca = 1) {
    const p = await preferencias();
    return podeAgirSozinho(
      { categoria, confianca },
      { modo: p.modo, categoriasLiberadas: p.categorias }
    );
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

  async function abrirRascunho({
    idConversa,
    texto,
    categoria,
    idPendencia = null,
    origem = "bot",
    confianca = 1,
  }) {
    /*
      Rascunho nascido de uma resposta SUA sai sem segunda aprovação: você
      já aprovou quando respondeu na Fila. Pedir duas confirmações pro mesmo
      dado é exatamente o atrito que faz largar a ferramenta.

      O que segura a segurança aqui não é a aprovação — é a conferência de
      procedência lá no redator: todo número do texto tem que estar na sua
      resposta, senão o rascunho é recusado e sai o seu texto cru.
    */
    const automatico =
      origem === "consultor" ? true : await podeSairSozinho(categoria, confianca);

    const { error } = await supabase.from("rascunhos").insert({
      user_id: userId,
      id_conversa: idConversa,
      texto_sugerido: texto,
      categoria,
      id_pendencia: idPendencia,
      // Aprovado de saida: a escuta pega e envia no proximo ciclo.
      status: automatico ? "aprovado" : "pendente",
      // "automatico" = saiu sem ninguem ler. Resposta do consultor sai
      // sozinha mas NAO e automatica: ele leu o caso e deu o dado. Por isso
      // ela vira exemplo em "Meu jeito" e a do bot nao.
      automatico: automatico && origem === "bot",
      origem,
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
    /*
      ====================================================================
      O ORQUESTRADOR

      Antes isto era uma escada de if/else. Agora tem três tempos separados:

        1. montar o retrato   — estado, memória, classificação, histórico
        2. decidir            — agente/decidir.js, função pura, testada
        3. executar           — só depois de o validador aprovar

      Separar importa porque a decisão passou a ser testável sem WhatsApp,
      sem banco e sem IA: 19 testes cobrem os caminhos, incluindo os que
      quase nunca acontecem em produção e por isso ninguém descobre a tempo.
      ====================================================================
    */
    async processarRecebida(conversa, texto, nomeCliente) {
      /* ---- 1. retrato ---- */

      // Silenciada: nem gasta consulta. O resto do retrato não importa.
      if (conversa.atender === false) {
        log.info(`${nomeCliente ?? "contato"} está silenciado. Só gravei.`);
        return;
      }

      const [temPendencia, ultimasMensagens] = await Promise.all([
        jaTemPendenciaAberta(conversa.id),
        ultimasDirecoes(conversa.id),
      ]);

      /*
        Só classifica se a conversa está de fato livre. Classificar custa
        segundos de CPU: cliente ansioso mandando três mensagens gerava três
        chamadas de IA que a máquina atende uma por vez, e as duas últimas
        estouravam o tempo esperando a primeira.
      */
      const travada =
        conversa.estagio === "aguardando_voce" ||
        temPendencia ||
        conversa.so_voce === true;

      const contexto = await contextoDaConversa(conversa.id);

      /*
        Lê a mensagem e guarda o que der: nome, convênio, banco, objetivo.
        Só chama a IA se ainda falta algo — quem já disse que é do INSS não
        precisa ser interpretado de novo.
      */
      let lembrado = await memoria.garantir(conversa.id);

      // Mesmo travada, vale aprender: o cliente pode ter dito o banco dele
      // enquanto esperava você. Extrair é barato e não gera ação nenhuma.
      const novosFatos = await memoria.extrairDaMensagem(texto, lembrado);
      if (Object.values(novosFatos).some(Boolean)) {
        lembrado = await memoria.aprender(conversa.id, novosFatos);
      }

      const classificacao = travada
        ? null
        : await classificar({ texto, contexto });

      /* ---- 2. decidir ---- */

      const decisao = decidir({
        // A decisão fala camelCase; o banco fala snake_case. A tradução é
        // aqui, no único lugar onde as duas se encontram.
        conversa: {
          ...conversa,
          temPendenciaAberta: temPendencia,
          soVoce: conversa.so_voce === true,
        },
        memoria: lembrado,
        classificacao,
        ultimasMensagens,
      });

      const conferida = validarDecisao(decisao);
      if (!conferida.ok) {
        /*
          Decisão malformada é bug, não caso de negócio. Não dá pra executar
          e não dá pra ignorar — o cliente ficaria sem resposta e ninguém
          saberia. Vai pro consultor com o defeito escrito.
        */
        log.erro(`Decisão inválida: ${conferida.problemas.join(", ")}`);
        await abrirPendencia({
          idConversa: conversa.id,
          pergunta: texto,
          contexto,
          categoria: "outro",
          motivo: "erro interno ao decidir",
          memoria: lembrado,
        });
        return;
      }

      await memoria.registrarAcao(conversa.id, decisao.acao, decisao.motivo);

      /* ---- 3. executar ---- */

      if (decisao.acao === ACOES.SILENCIAR || decisao.acao === ACOES.AGUARDAR) {
        log.info(`· ${nomeCliente ?? ""} — ${decisao.motivo}`);
        return;
      }

      if (decisao.acao === ACOES.PERGUNTAR_CLIENTE) {
        await pedirAoCliente({
          conversa,
          nomeCliente,
          pedido: decisao.pedido,
          contexto,
          porque: texto,
          confianca: decisao.confianca,
        });
        return;
      }

      if (decisao.acao === ACOES.PEDIR_AO_CONSULTOR) {
        const abriu = await abrirPendencia({
          idConversa: conversa.id,
          pergunta: texto,
          contexto,
          categoria: decisao.categoria ?? "outro",
          motivo: decisao.motivo,
          memoria: lembrado,
        });

        // Conta só quando de fato criou uma pendência nova: o freio do
        // ping-pong mede casos, não mensagens repetidas do mesmo cliente.
        if (abriu) {
          await supabase
            .from("conversas")
            .update({
              escalonamentos: (conversa.escalonamentos ?? 0) + 1,
              // O freio pegou: a conversa passa a ser sua até você devolver.
              ...(decisao.assumirManual ? { so_voce: true } : {}),
            })
            .eq("id", conversa.id);
        }

        if (decisao.assumirManual) {
          log.alerta(
            `${nomeCliente ?? "Cliente"} já voltou pra você ${conversa.escalonamentos}x. ` +
              `Assumi que o bot não resolve esta: ele só grava daqui, até você devolver em Conversas.`
          );
        }
        log.destaque(
          `→ FILA  ${nomeCliente ?? ""} · ${decisao.motivo}` +
            (decisao.confianca === 1 ? " (regra rígida)" : "")
        );
        return;
      }

      /* ACOES.RESPONDER — o único caminho que gera texto pro cliente. */
      const categoria = decisao.categoria;


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
        origem: "consultor",
      });

      /*
        Você respondeu, então a conversa volta a andar sozinha. O contador
        de escalonamentos zera aqui: o caso ANDOU. Ele só cresce quando a
        mesma conversa volta pra sua mão sem ter saído do lugar.
      */
      await supabase
        .from("conversas")
        .update({ escalonamentos: 0 })
        .eq("id", pendencia.id_conversa);

      await memoria.registrarAcao(
        pendencia.id_conversa,
        "retomou_apos_consultor",
        "você respondeu; segui sozinho daqui"
      );

      log.destaque(
        `↩ Retomando ${conversa?.nome ?? "cliente"} com o que você respondeu. Sai sem esperar aprovação.`
      );
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
