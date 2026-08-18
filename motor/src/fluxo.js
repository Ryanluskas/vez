import { classificar } from "./classificar.js";
import { escreverResposta, escreverComResposta, escreverPedido } from "./redator.js";
import { criarMemoria } from "./memoria.js";
import { REQUISITOS, queFalta } from "./requisitos.js";
import { decidir, podeAgirSozinho, ACOES } from "./agente/decidir.js";
import { validarDecisao, validarAntesDeEnviar } from "./agente/validar.js";
import { criarExecutor } from "./agente/executor.js";
import { planejarConsultas, consultasEmTexto } from "./agente/planejar.js";
import { EVENTOS, observadorMudo } from "./observar.js";
import { criarTravas } from "./travas.js";
import { criarLista } from "./lista.js";
import { numerosDeRisco } from "./numeros.js";
import * as respostas from "./respostas.js";
import { resolver, comoResponderSemTer, tirarOQueJaSei, oQueJaSei } from "./referencias.js";
import { comoChamarAFonte, jaFoiDito } from "./valores.js";
import { ehAbordagem, aceitouAAbordagem, primeiroNome } from "./abordagem.js";
import { exemplosComBase } from "./estilo.js";
import { log } from "./log.js";

/* Quantas mensagens vao no contexto que a IA le e que aparece no painel. */
const TAMANHO_DO_CONTEXTO = 4;

/* Quantos exemplos do "Meu jeito" entram no prompt. Mais que isso, o modelo
   pequeno perde o fio e comeca a copiar o exemplo em vez de imitar o tom. */
const EXEMPLOS_NO_PROMPT = 3;

export function criarFluxo(supabase, userId, { observador = observadorMudo() } = {}) {
  const memoria = criarMemoria(supabase, userId);

  /* A planilha que o consultor subiu — a única fonte de valor que existe. */
  const lista = criarLista(supabase, userId);

  /*
    Uma fila por conversa. Cliente ansioso manda três mensagens em três
    segundos: sem isto o motor classifica as três em paralelo e ele recebe
    três respostas. Com isto, uma de cada vez — e as outras conversas
    seguem em paralelo, sem esperar esta.
  */
  const travas = criarTravas();

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

  /*
    ==================================================================
    O QUE EU JÁ DISSE, MAIS O QUE ESTÁ SAINDO

    `contextoDaConversa` lê da tabela `mensagens`, e ela só recebe a
    linha de saída DEPOIS que a escuta enviou de fato. Entre decidir e
    registrar existe uma janela, e cliente ansioso escreve dentro dela.

    Medido: o Ademar mandou "aquele valor" e, em seguida, "você já me
    disse o valor". A segunda entrou antes de a primeira resposta ficar
    registrada — o agente olhou o histórico, não viu o número, e mandou
    o mesmo texto de novo. Exatamente o que o cliente estava dizendo que
    não precisava.

    A trava por conversa serializa o PROCESSAMENTO, não o envio, então
    ela não resolve isto.

    O rascunho resolve: ele é criado no instante da decisão. Se existe
    rascunho com aquele número, o número já foi dito ou está a caminho —
    e nos dois casos repetir é errado.
    ==================================================================
  */
  async function oQueJaFalei(idConversa) {
    const [contexto, { data: rascunhos }] = await Promise.all([
      contextoDaConversa(idConversa),
      supabase
        .from("rascunhos")
        .select("texto_sugerido")
        .eq("id_conversa", idConversa)
        .order("criado_em", { ascending: false })
        .limit(TAMANHO_DO_CONTEXTO),
    ]);

    const meus = (rascunhos ?? []).map((r) => r.texto_sugerido ?? "");

    return {
      tudo: [contexto ?? "", ...meus].join("\n"),
      /*
        Quantas vezes eu já confirmei "é essa mesma" sem trazer nada
        novo. Passa da conta e o assunto deixa de ser o número: vira o
        cliente não conseguindo seguir, e isso é caso de gente.
      */
      confirmacoes: meus.filter((t) => respostas.ehConfirmacaoDeQueJaFalei(t)).length,
    };
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
      nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
      contexto,
      exemplos: await exemplosDaCategoria("documentos"),
      manual: await manualDaOperacao(),
      memoria: memoria.emTexto(lembrado),
    });

    /*
      A IA aqui é enfeite, não estrutura. O QUE pedir vem de
      `requisitos.js`, que é código; o modelo só deixa a frase mais
      natural. Falhou, sai a versão determinística — mesma informação,
      escrita à mão, sem esperar ninguém.
    */
    const mensagem =
      texto ??
      respostas.pedirOQueFalta(pedido, lembrado?.nome ?? nomeCliente) ??
      `Oi! Pra eu continuar, ${pedido.texto}.`;

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

  /*
    ==================================================================
    RESPONDER COM O QUE ESTÁ NA LISTA

    A planilha faz aqui o papel que a sua resposta na Fila faz no
    handoff: ela é o DADO, e o modelo só embrulha. Por isso reusa o
    mesmo redator — `escreverComResposta` já sabe copiar número exato
    sem acrescentar nenhum.

    O que sai daqui NUNCA vai sozinho, nem em modo autônomo. O dado é
    real, mas ninguém conferiu se é o dado DAQUELA pessoa: a planilha
    casa por telefone, e telefone trocado vira saldo de um cliente indo
    pro outro. Uma aprovação antes do primeiro número sair custa
    segundos; o contrário custa um cliente.

    Devolve false quando não deu pra escrever com segurança — e aí quem
    chamou manda pra Fila, que é o caminho de sempre.
    ==================================================================
  */
  /*
    ==================================================================
    QUEM PÔS O NÚMERO DECIDE QUEM CONFERE

    Esta função gravava `origem: "lista"` fixo, e isso custava caro: um
    valor que VOCÊ digitou na Fila virava rascunho esperando a sua
    aprovação. A sua, de novo, do mesmo número que você acabou de dar.

    Do lado do cliente isso é silêncio. Ele perguntou "aquele valor" e
    não recebeu nada, porque o produto estava pedindo autorização pra
    repetir o que o dono já tinha autorizado.

    `abrirRascunho` já sabia a diferença e ninguém contava pra ele:

      consultor   você olhou o caso e digitou. Sai sozinho.
      lista       planilha casada por telefone — ninguém conferiu se é o
                  número DESTA pessoa. Sempre espera seu OK.
      ferramenta  veio de sistema, pelo executor. Trata como lista:
                  correto na origem, não conferido pra este cliente.

    Note o que NÃO mudou: a conferência de procedência dos números
    continua acontecendo antes, e um número que não esteja na fonte
    continua sendo barrado. O que mudou é só quem precisa clicar depois.
    ==================================================================
  */
  async function responderComALista({
    conversa,
    nomeCliente,
    pergunta,
    contexto,
    lembrado,
    dados,
    categoria,
    origem = "lista",
  }) {
    const manual = await manualDaOperacao();
    const exemplos = await exemplosDaCategoria(categoria);
    const comecou = Date.now();

    const texto = await escreverComResposta({
      mensagemCliente: pergunta,
      respostaDoConsultor: dados.texto,
      nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
      exemplos,
      manual,
      memoria: memoria.emTexto(lembrado),
    });

    observador.registrar(EVENTOS.ESCREVEU, {
      idConversa: conversa.id,
      ok: !!texto,
      detalhe: `com valores da lista "${dados.de}"`,
      ms: Date.now() - comecou,
    });

    if (!texto) return false;

    /*
      A conferência de procedência com a lista como fonte. Todo número do
      rascunho tem que estar no que a planilha devolveu — e a planilha já
      devolveu tudo com a porcentagem aplicada. Se o modelo escrever o
      valor cheio, ele não bate com nada e o rascunho é recusado.
    */
    const porta = validarAntesDeEnviar(texto, {
      permitirNumeros: true,
      fontesPermitidas: [dados.texto, pergunta, manual],
      exemplos,
      manual,
      memoria: lembrado,
      nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
      contextoDaConversa: contexto,
      mensagemCliente: pergunta,
    });

    observador.registrar(EVENTOS.VALIDOU, {
      idConversa: conversa.id,
      ok: porta.ok,
      detalhe: porta.ok ? "aprovada (valores da lista)" : `${porta.codigo}: ${porta.motivo}`,
    });

    if (!porta.ok) {
      log.alerta(`Barrei o texto da lista (${porta.motivo}). Vai pra Fila.`);
      return false;
    }

    const sozinho = await abrirRascunho({
      idConversa: conversa.id,
      texto,
      categoria,
      origem,
    });

    log.destaque(
      sozinho
        ? `→ RESPONDENDO  ${nomeCliente ?? ""} · com o número que ${dados.de} passou`
        : `→ RASCUNHO  ${nomeCliente ?? ""} · valores de "${dados.de}" · esperando seu OK`
    );
    return true;
  }

  /*
    ==================================================================
    O CLIENTE NUNCA FICA NO SILÊNCIO

    Antes, quando a IA falhava, a conversa ia pra Fila e pronto: o
    cliente mandou uma pergunta e não recebia NADA até o consultor abrir
    o painel. Do lado dele, isso é indistinguível de ter sido ignorado —
    e é o que faz procurar outro consultor.

    Agora todo caminho que termina em Fila manda antes um aviso curto.
    Ele não responde a pergunta, não promete valor, não promete prazo:
    diz que a mensagem chegou e que alguém vai olhar. Que é a verdade.

    Sai em QUALQUER modo, inclusive manual, pela mesma razão que o
    follow-up sai: texto fixo, escrito à mão, sem número, sem IA no
    meio. Um aviso que espera aprovação não é aviso — quando o consultor
    aprovar, o cliente já foi embora.

    Uma vez por conversa por vez: se ele já está esperando, não precisa
    ouvir de novo a cada mensagem que manda.
  */
  async function avisarQueVaiVerificar({ conversa, nomeCliente, lembrado }) {
    const texto = respostas.conferido(
      respostas.vouVerificar(lembrado?.nome ?? nomeCliente, Date.now())
    );

    if (!texto) return false;

    const { error } = await supabase.from("rascunhos").insert({
      user_id: userId,
      id_conversa: conversa.id,
      texto_sugerido: texto,
      categoria: "saudacao",
      status: "aprovado",
      // Não é exemplo do jeito dele de falar: é texto meu, fixo.
      automatico: true,
      origem: "bot",
    });

    if (error) {
      log.erro(`Não consegui avisar o cliente: ${error.message}`);
      return false;
    }

    observador.registrar(EVENTOS.ENVIADA, {
      idConversa: conversa.id,
      detalhe: "aviso de que vai verificar (fallback)",
    });

    return true;
  }

  /*
    Manda pra Fila SEMPRE avisando o cliente antes.

    Todo `solicitar_intervencao` do orquestrador passa por aqui. É o
    único jeito de garantir que não sobre um caminho em que a conversa
    congela em silêncio — se fosse opcional, o próximo caminho novo
    esqueceria.
  */
  async function mandarProConsultor({
    ciclo,
    conversa,
    nomeCliente,
    lembrado,
    pergunta,
    motivo,
    categoria,
    avisar = true,
  }) {
    const chamada = await ciclo.usar("solicitar_intervencao", {
      id_conversa: conversa.id,
      pergunta,
      motivo,
      categoria: categoria ?? "outro",
    });

    /*
      Avisa só quando a pendência é NOVA. Pendência duplicada significa
      que ele já foi avisado — repetir "já te respondo" a cada mensagem
      é pior que não dizer nada.
    */
    if (avisar && chamada.ok && chamada.dados?.id) {
      await avisarQueVaiVerificar({ conversa, nomeCliente, lembrado });
    }

    return chamada;
  }

  /*
    ==================================================================
    RESPONDER O QUE ELE ESTÁ REFERENCIANDO

    Devolve true quando resolveu — e aí o fluxo normal nem roda.

    Três caminhos, e nenhum deles é "recomeçar a investigação":

    1. Ele aponta pra simulação e eu TENHO o número → responde com ele.
       O número vem do estado, gravado com procedência, e o validador
       confere contra essa mesma fonte. Não é o modelo lembrando: é o
       banco de dados devolvendo o que VOCÊ disse.

    2. Ele aponta pra algo que eu NÃO tenho → pergunta só o que amarra a
       referência. Uma pergunta, sem número.

    3. Ele diz que já informou, e eu tenho o que ele diz → confirma em
       voz alta e segue. É o oposto de perguntar de novo.
    ==================================================================
  */
  async function responderReferencia({
    conversa,
    nomeCliente,
    lembrado,
    referencia,
    pergunta,
    contexto,
    ciclo,
  }) {
    const nome = lembrado?.nome ?? nomeCliente;

    /* ---- Aponta pro número: "aquele valor", "você já me disse o valor" ---- */
    if (referencia.alvo === "simulacao" || referencia.alvo === "valor_ja_dito") {
      if (!referencia.tenho) {
        /*
          Não tenho número de fonte confiável. Três coisas que NÃO faço:
          inventar, estimar, ou devolver a pergunta pro cliente.

          O que sai é o reconhecimento — "vou confirmar" — e ele sai
          SOZINHO, em qualquer modo. É texto fixo escrito à mão, sem
          número e sem IA no meio; um reconhecimento que espera aprovação
          não é reconhecimento, é o mesmo silêncio de antes.

          Em paralelo o caso vai pra Fila, que é onde o número existe.
        */
        const reconhece = respostas.conferido(comoResponderSemTer(referencia));

        if (reconhece) {
          await abrirRascunho({
            idConversa: conversa.id,
            texto: comNomeNaFrente(nome, reconhece),
            /*
              Categoria "saudacao", não "valor", e a diferença é o que a
              frase É: ela não carrega número nenhum e nunca vai carregar
              — é a admissão de que o número está sendo buscado. Marcá-la
              como "valor" a prendia atrás da barreira financeira e o
              cliente ficava sem resposta justamente no caso em que o
              agente não tem nada a dizer.

              O guarda de dinheiro roda em cima dela do mesmo jeito, logo
              acima, no `conferido()`.
            */
            categoria: "saudacao",
          });
        }

        await mandarProConsultor({
          ciclo,
          conversa,
          nomeCliente,
          lembrado,
          pergunta,
          motivo:
            referencia.alvo === "valor_ja_dito"
              ? "ele diz que eu já passei o valor e eu não tenho o número"
              : "ele cobrou o valor da simulação e eu não tenho o número",
          categoria: "valor",
          // Já reconheci; dois avisos seguidos é ruído.
          avisar: !reconhece,
        });

        log.destaque(
          `→ FILA  ${nomeCliente ?? ""} · ${referencia.porque ?? "não tenho o número"}, e ele é seu`
        );
        return true;
      }

      /*
        Tenho. O número sai do ESTADO, não do modelo — e a fonte que o
        validador vai conferir é exatamente ele.
      */
      const s = referencia.simulacao;

      /*
        Mas já contei? Então confirmo, não repito.

        Ele acabou de ler o número. Mandar de novo, palavra por palavra,
        é o que fazia o produto parecer máquina — ainda mais quando a
        mensagem dele é justamente "você já me disse". Um consultor
        responde "isso mesmo, é essa que te passei" e segue.

        Sem número nesta frase de propósito: ele já tem o número. O que
        falta é a confirmação de que os dois falam da mesma coisa.
      */
      const falado = await oQueJaFalei(conversa.id);

      if (jaFoiDito(s, falado.tudo)) {
        /*
          `jaTeFalei` devolve null quando acabam as variantes — sinal de
          que já confirmei duas vezes e ele continua voltando ao mesmo
          ponto. Aí o problema não é o número: é a conversa travada, e
          quem destrava é você. Caindo fora do `if`, segue pro caminho
          normal, que termina em Fila com aviso.
        */
        const texto = respostas.conferido(respostas.jaTeFalei(nome, falado.confirmacoes));

        if (texto) {
          const sozinho = await abrirRascunho({
            idConversa: conversa.id,
            texto,
            /*
              Não é categoria "valor": a frase não carrega número e nunca
              vai carregar. Marcar como "valor" a prenderia atrás da
              barreira financeira e o cliente ficaria sem resposta no
              caso em que o agente não tem nada de novo a dizer.
            */
            categoria: "acompanhamento",
          });

          log.destaque(
            `→ ${sozinho ? "RESPONDENDO" : "rascunho"}  ${nomeCliente ?? ""} · já tinha passado esse número`
          );
          return true;
        }
      }
      const comoTexto = [
        s.valor ? `valor ${s.valor}` : null,
        s.parcela ? `parcela ${s.parcela}` : null,
        s.taxa ? `taxa ${s.taxa}` : null,
      ]
        .filter(Boolean)
        .join(", ");

      const respondeu = await responderComALista({
        conversa,
        nomeCliente,
        pergunta,
        contexto,
        lembrado,
        dados: { texto: comoTexto, de: comoChamarAFonte(s.de) },
        categoria: "valor",
        /*
          A procedência viaja junto. Número que VOCÊ deu sai sozinho —
          você já conferiu quando digitou. Número de lista ou de
          ferramenta continua esperando seu OK, porque ninguém confirmou
          que aquela linha é desta pessoa.
        */
        origem: s.de === "consultor" ? "consultor" : "lista",
      });

      if (respondeu) return true;

      // Não deu pra escrever com segurança: segue o caminho normal.
      return false;
    }

    /*
      ---- Ele contesta o pedido: "mas você nem pediu isso" ----

      Isto é correção, não pergunta. O bot pediu documento numa etapa em
      que documento não era o assunto, e ele reclamou — com razão.

      Repetir o pedido aqui é a pior resposta possível: confirma que
      ninguém está lendo. Recuar custa uma frase.
    */
    if (referencia.alvo === "contesta_pedido") {
      const texto = respostas.conferido(respostas.meAdiantei(nome, Date.now()));
      if (!texto) return false;

      /*
        Recuar de verdade significa parar de pedir. O contador de pedidos
        volta ao ponto em que ele estava, senão o próximo pedido sai igual
        e a desculpa não valeu nada.
      */
      await memoria.mudarEtapaComercial(conversa.id, "interesse", null);

      const sozinho = await abrirRascunho({
        idConversa: conversa.id,
        texto,
        categoria: "saudacao",
      });

      log.info(
        `→ ${sozinho ? "RESPONDENDO" : "rascunho"}  ${nomeCliente ?? ""} · recuei, ele tinha razão`
      );
      return true;
    }

    /* ---- Ele diz que já informou ---- */
    if (referencia.alvo === "ja_informado") {
      if (!referencia.tenho) return false;

      /*
        Ele tem razão: eu tenho o que ele diz ter dado. Confirmar em voz
        alta é o que faz a memória valer pra ele — e é o oposto exato de
        perguntar de novo.
      */
      const sabidos = referencia.jaSei
        .filter((s) => s.campo !== "simulacao")
        .map((s) => rotuloDoQueSei(s))
        .filter(Boolean);

      if (sabidos.length === 0) return false;

      const texto = respostas.conferido(
        comNomeNaFrente(
          nome,
          `isso mesmo, já tenho aqui: ${juntar(sabidos)}. Deixa eu seguir daqui.`
        )
      );

      if (!texto) return false;

      const sozinho = await abrirRascunho({
        idConversa: conversa.id,
        texto,
        categoria: "saudacao",
      });

      log.info(
        `→ ${sozinho ? "RESPONDENDO" : "rascunho"}  ${nomeCliente ?? ""} · confirmei o que já sei`
      );
      return true;
    }

    /* ---- Aponta pro contrato ---- */
    if (referencia.alvo === "contrato" && referencia.tenho) {
      // Sei o banco. Não é motivo pra responder sozinho, mas é motivo
      // pra NÃO perguntar qual é — e disso o `tirarOQueJaSei` cuida.
      return false;
    }

    /* ---- Ele diz que já mandou documento ---- */
    if (referencia.alvo === "documento_enviado") {
      if (!referencia.tenho) {
        const amarra = respostas.conferido(comoResponderSemTer(referencia));
        if (!amarra) return false;

        await abrirRascunho({
          idConversa: conversa.id,
          texto: comNomeNaFrente(nome, amarra),
          categoria: "documentos",
        });
        return true;
      }

      const texto = respostas.conferido(
        respostas.documentoRecebido(nome, queFalta(lembrado, { para: "fechar" }))
      );
      if (!texto) return false;

      await abrirRascunho({ idConversa: conversa.id, texto, categoria: "documentos" });
      return true;
    }

    return false;
  }

  function comNomeNaFrente(nome, frase) {
    const curto = primeiroNome(nome);
    if (!curto) return frase.charAt(0).toUpperCase() + frase.slice(1);
    return `${curto}, ${frase.charAt(0).toLowerCase()}${frase.slice(1)}`;
  }

  function juntar(lista) {
    if (lista.length === 1) return lista[0];
    return `${lista.slice(0, -1).join(", ")} e ${lista.at(-1)}`;
  }

  const COMO_DIZER = {
    convenio: { inss: "que você é do INSS", servidor: "que você é servidor", militar: "que você é militar" },
  };

  function rotuloDoQueSei({ campo, valor }) {
    if (campo === "convenio") return COMO_DIZER.convenio[valor] ?? null;
    if (campo === "banco") return `seu contrato no ${valor}`;
    if (campo === "nome") return null;
    if (campo === "objetivo") return null;
    return REQUISITOS[campo] ? `seu ${REQUISITOS[campo].rotulo}` : null;
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
      Três procedências, três regras — e a diferença entre elas é quem já
      olhou aquele dado:

        'consultor'  você respondeu na Fila. Sai sem segunda aprovação:
                     você já aprovou quando respondeu, e pedir duas
                     confirmações pro mesmo dado é o atrito que faz largar
                     a ferramenta.

        'lista'      o número é real, mas ninguém conferiu se é o número
                     DAQUELA pessoa — a planilha casa por telefone. Sempre
                     espera seu OK, em qualquer modo.

        'bot'        depende do modo e da categoria.
    */
    const automatico =
      origem === "consultor"
        ? true
        : origem === "lista"
          ? false
          : await podeSairSozinho(categoria, confianca);

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

  /*
    As ferramentas do agente. Elas recebem tudo que precisam por aqui —
    nenhuma delas conhece o Supabase por conta própria, e é isso que faz
    cada uma ser testável com um banco de mentira.
  */
  const executor = criarExecutor({
    supabase,
    userId,
    memoria,
    abrirPendencia,
    contextoDaConversa,
    observador,
    lista,
  });

  return {
    executor,
    travas,
    observador,
    lista,

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

      /*
        ================================================================
        O BOT APRENDE COM AS PRÓPRIAS MENSAGENS

        A abordagem diz "Oi Ademar, seu contrato Santander…". Isso é nome
        e banco, ditos na conversa, e se perdiam inteiros — duas mensagens
        depois o bot perguntava o banco que ele mesmo tinha citado.

        A informação não passa a existir porque o cliente a repetiu.
        ================================================================
      */
      if (direcao === "enviada" && ehAbordagem(texto)) {
        await memoria.garantir(conversa.id);
        await memoria.aprenderDaAbordagem(conversa.id, texto);
      }

      return conversa;
    },

    /*
      Chegou arquivo. Nao classifica: foto de contracheque nao tem texto pra
      classificar, e o que importa aqui e avisar o consultor de que a bola
      voltou pra ele.
    */
    async marcarDocumentoRecebido(conversa) {
      const ciclo = executor.novoCiclo({ idConversa: conversa.id, quem: "documento" });

      /*
        Passa pela ferramenta em vez de escrever direto: assim chegar
        arquivo duas vezes (o WhatsApp reentrega evento) não marca duas
        vezes, e o que aconteceu fica registrado como qualquer outra ação.
      */
      const r = await ciclo.usar("registrar_documento_recebido", {
        id_conversa: conversa.id,
      });

      if (!r.ok) {
        log.erro(`Não consegui registrar o documento: ${r.erro}`);
        observador.registrar(EVENTOS.ERRO, {
          idConversa: conversa.id,
          ok: false,
          detalhe: `documento não registrado: ${r.erro}`,
        });
        return;
      }

      observador.registrar(EVENTOS.FUNIL, {
        idConversa: conversa.id,
        detalhe: "documentos recebidos",
      });

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
      /*
        Tudo daqui pra baixo roda com a conversa travada. É o que impede
        duas mensagens do mesmo cliente de virarem duas respostas — e é
        por conversa, então o cliente A travado não segura o cliente B.
      */
      return travas.naVezDe(conversa.id, () =>
        this.decidirEExecutar(conversa, texto, nomeCliente)
      );
    },

    async decidirEExecutar(conversa, texto, nomeCliente) {
      /* ---- 1. retrato ---- */

      // Silenciada: nem gasta consulta. O resto do retrato não importa.
      if (conversa.atender === false) {
        log.info(`${nomeCliente ?? "contato"} está silenciado. Só gravei.`);
        return;
      }

      observador.registrar(EVENTOS.RECEBIDA, {
        idConversa: conversa.id,
        detalhe: `${texto.length} caracteres`,
      });

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

      /*
        Um ciclo de ferramentas por mensagem. O limite e a proteção contra
        repetição valem dentro dele: duas mensagens do mesmo cliente são
        dois ciclos, e a segunda pode legitimamente refazer o que a
        primeira fez.
      */
      const ciclo = executor.novoCiclo({
        idConversa: conversa.id,
        quem: nomeCliente ?? conversa.telefone,
      });

      // Mesmo travada, vale aprender: o cliente pode ter dito o banco dele
      // enquanto esperava você. Extrair é barato e não gera ação nenhuma.
      const novosFatos = await memoria.extrairDaMensagem(texto, lembrado);
      if (Object.values(novosFatos).some(Boolean)) {
        /*
          A extração é da IA; a gravação passa pela ferramenta. É ali que
          um "banco: 4200" — que o modelo já tentou inventar em teste — é
          barrado antes de virar memória do cliente.
        */
        const gravou = await ciclo.usar("atualizar_memoria", {
          id_conversa: conversa.id,
          ...Object.fromEntries(
            Object.entries(novosFatos).filter(([, v]) => v)
          ),
        });

        if (gravou.ok) {
          lembrado = await memoria.ler(conversa.id);
          if (gravou.dados?.gravou) {
            observador.registrar(EVENTOS.MEMORIA, {
              idConversa: conversa.id,
              detalhe: `aprendi ${gravou.dados.campos.join(", ")}`,
            });
          }
        }
      }

      /*
        ================================================================
        "EU JÁ SEI ISSO?" — ANTES DE PERGUNTAR QUALQUER COISA

        O cliente escreve "aquele valor", "você já me disse", "já mandei".
        Isso não é uma pergunta nova: é um ponteiro pra trás.

        Antes, cada mensagem chegava como se fosse a primeira. O cliente
        dizia "preciso saber se ainda libera pra mim" e recebia "você é
        aposentado do INSS ou servidor? em qual banco…" — a investigação
        recomeçando do zero, sobre um contrato que o próprio bot tinha
        citado na mensagem de abertura.

        Quem responde "eu já sei isso?" é o ESTADO, nunca o modelo. Modelo
        perguntado se já sabe algo responde o que soar plausível. Aqui é
        leitura de banco: ou o campo tem valor, ou não tem.
        ================================================================
      */
      const referencia = resolver(texto, lembrado);

      if (referencia) {
        observador.registrar(EVENTOS.CLASSIFICOU, {
          idConversa: conversa.id,
          detalhe: `referência a "${referencia.alvo}" · ${referencia.tenho ? "eu tenho" : "não tenho"}`,
        });
      }

      const classificacao = travada
        ? null
        : await classificar({ texto, contexto });

      if (classificacao) {
        observador.registrar(EVENTOS.CLASSIFICOU, {
          idConversa: conversa.id,
          detalhe:
            `${classificacao.categoria}` +
            (classificacao.precisaDoRyan ? " · precisa de você" : "") +
            (classificacao.decidiuNaRegra ? " (regra rígida)" : ""),
        });
      }

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

      observador.registrar(EVENTOS.DECIDIU, {
        idConversa: conversa.id,
        detalhe: `${decisao.acao} — ${decisao.motivo}`,
      });

      /* ---- 3. executar ---- */

      if (decisao.acao === ACOES.SILENCIAR || decisao.acao === ACOES.AGUARDAR) {
        log.info(`· ${nomeCliente ?? ""} — ${decisao.motivo}`);
        return;
      }

      /*
        ================================================================
        A REFERÊNCIA GANHA DA INVESTIGAÇÃO

        Antes de qualquer pergunta, o ponteiro pra trás. Duas saídas, e
        nenhuma delas é "começar tudo de novo":

        TENHO o que ele referenciou (a simulação que você passou, o banco
        do contrato, o documento que ele mandou) → continua dali. Se for
        número, ele vem do estado, com procedência gravada — nunca do
        modelo.

        NÃO TENHO → pergunto SÓ o que amarra a referência. Uma pergunta,
        sem número, e o assunto continua sendo o dele.
        ================================================================
      */
      if (referencia && !travada) {
        const seguiu = await responderReferencia({
          conversa,
          nomeCliente,
          lembrado,
          referencia,
          pergunta: texto,
          contexto,
          ciclo,
        });

        if (seguiu) return;
      }

      if (decisao.acao === ACOES.PERGUNTAR_CLIENTE) {
        /*
          Última rede antes de abrir a boca: tira do pedido tudo que o
          estado já tem. `montarPedido` já filtra, mas repetir pergunta é
          o erro mais caro do produto — mais caro que não responder,
          porque destrói a confiança em vez de só adiar.
        */
        const pedido = tirarOQueJaSei(decisao.pedido, lembrado);

        if (!pedido) {
          log.alerta("Ia pedir só o que eu já sabia. Mandando pra você em vez disso.");
          await mandarProConsultor({
            ciclo,
            conversa,
            nomeCliente,
            lembrado,
            pergunta: texto,
            motivo: "já tenho tudo que ia perguntar; falta um dado seu",
            categoria: decisao.categoria ?? "outro",
          });
          return;
        }

        if (pedido.filtrado) {
          log.info(`   tirei do pedido o que já sabia: sobrou ${pedido.chaves.join(", ")}`);
        }

        await pedirAoCliente({
          conversa,
          nomeCliente,
          pedido,
          contexto,
          porque: texto,
          confianca: decisao.confianca,
        });
        return;
      }

      if (decisao.acao === ACOES.PEDIR_AO_CONSULTOR) {
        /*
          ================================================================
          ANTES DE TE CHAMAR, OLHA A LISTA

          Se o cliente está numa planilha que você subiu, o dado que ia
          faltar já existe. Não é o modelo inventando: é o número que você
          apurou, com a porcentagem que você configurou, aplicada em código
          antes de qualquer prompt.

          Não achou? Segue o caminho de sempre — a pergunta vai pra Fila.
          A lista é atalho, nunca dependência.
          ================================================================
        */
        const daLista =
          decisao.escalonamento === "valor"
            ? await ciclo.usar("consultar_simulacao", { id_conversa: conversa.id })
            : null;

        if (daLista?.ok && daLista.dados.disponivel) {
          const respondeu = await responderComALista({
            conversa,
            nomeCliente,
            pergunta: texto,
            contexto,
            lembrado,
            dados: daLista.dados,
            categoria: decisao.categoria ?? "valor",
          });

          if (respondeu) return;
          // Não deu pra escrever com segurança: cai pra Fila, como sempre.
        }

        const chamada = await mandarProConsultor({
          ciclo,
          conversa,
          nomeCliente,
          lembrado,
          pergunta: texto,
          motivo: decisao.motivo,
          categoria: decisao.categoria ?? "outro",
        });

        /*
          A ferramenta falhou (banco fora, tempo estourado). Não dá pra
          engolir: o cliente perguntou algo que só você responde e ninguém
          ficaria sabendo. Deixa a conversa esperando e grita no log.
        */
        if (!chamada.ok) {
          log.erro(
            `Não consegui pôr ${nomeCliente ?? "o cliente"} na fila: ${chamada.erro}`
          );
          await mudarEstagio(conversa.id, "aguardando_voce");
          return;
        }

        const abriu = chamada.dados.id;

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

        observador.registrar(EVENTOS.HANDOFF, {
          idConversa: conversa.id,
          // O detalhe vira a métrica "motivos de handoff": mantê-lo curto e
          // repetível é o que faz o agrupamento significar alguma coisa.
          detalhe: decisao.escalonamento ?? decisao.categoria ?? "outro",
        });

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

      /*
        ================================================================
        CLASSIFICAR ≠ ESCREVER

        O código já sabe o que o cliente quer. Em alguns casos ele
        também sabe o que responder, e aí não existe motivo pra chamar
        modelo nenhum: "bom dia" tem uma resposta certa, e ela não muda
        conforme a interpretação.

        Isto vem ANTES da IA, não depois. Antes era o contrário — a IA
        tentava, demorava 30 segundos e às vezes falhava, e só então
        caía num texto fixo. O caminho mais comum do atendimento estava
        passando pela peça mais frágil sem precisar.

        Nenhuma resposta daqui tem número. `respostas.js` confere isso
        na saída, além de eu ter escrito todas à mão.
        ================================================================
      */
      const semIa = respostas.respostaDeterministica({
        categoria,
        mensagemCliente: texto,
        nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
        fatosNovos: novosFatos,
        semente: Date.now(),
      });

      if (semIa) {
        observador.registrar(EVENTOS.ESCREVEU, {
          idConversa: conversa.id,
          detalhe: `${categoria} · sem IA`,
          ms: 0,
        });

        const sozinhoSemIa = await abrirRascunho({
          idConversa: conversa.id,
          texto: semIa,
          categoria,
          confianca: decisao.confianca,
        });

        log.info(
          `→ ${sozinhoSemIa ? "RESPONDENDO" : "rascunho"}  ${nomeCliente ?? ""} · ${categoria} · sem IA`
        );
        return;
      }

      /*
        Aqui, e só aqui, o modelo escolhe ferramenta. Ele lê a mensagem e
        diz o que precisa consultar pra responder — o trecho do manual que
        fala do assunto, o que ainda falta do cliente.

        Só leitura. Escrever é decidir, e decidir continua sendo do
        `decidir.js`. E o id da conversa é preenchido pelo código: se
        viesse do modelo, uma alucinação leria os dados de outro cliente.
      */
      const consultas = await ciclo.usarVarias(
        await planejarConsultas({ texto, idConversa: conversa.id })
      );

      const exemplos = await exemplosDaCategoria(categoria);
      const manual = await manualDaOperacao();

      const comecouAEscrever = Date.now();
      const rascunho = await escreverResposta({
        mensagemCliente: texto,
        nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
        contexto,
        exemplos,
        manual,
        memoria: memoria.emTexto(lembrado),
        consultas: consultasEmTexto(consultas),
      });

      /*
        A IA não produziu nada que preste — caiu, estourou o tempo, ou
        escreveu algo que o guarda recusou.

        Isso não é falha do produto: é o produto se recusando a chutar.
        Mas o cliente não pode pagar por isso com silêncio. Vai pra Fila
        E recebe o aviso de que alguém vai olhar.
      */
      if (!rascunho) {
        observador.registrar(EVENTOS.ESCREVEU, {
          idConversa: conversa.id,
          ok: false,
          detalhe: "não soube responder sem chutar",
          ms: Date.now() - comecouAEscrever,
        });

        await mandarProConsultor({
          ciclo,
          conversa,
          nomeCliente,
          lembrado,
          pergunta: texto,
          motivo: "o bot não soube responder sem chutar",
          categoria,
        });

        log.info(`→ fila  ${nomeCliente ?? ""} · o bot não soube escrever (avisei o cliente)`);
        return;
      }

      observador.registrar(EVENTOS.ESCREVEU, {
        idConversa: conversa.id,
        detalhe: `${categoria} · ${rascunho.length} caracteres`,
        ms: Date.now() - comecouAEscrever,
      });

      /*
        ================================================================
        A ÚLTIMA PORTA

        Nenhuma mensagem chega ao cliente sem passar por aqui. O redator
        já tem as próprias barreiras, e mesmo assim isto existe: o
        redator confere o texto que ele mesmo pediu, com o contexto que
        ele mesmo montou. O validador confere com o caso inteiro na mão —
        a memória, os exemplos, o manual, o que o cliente escreveu.

        Reprovar não é "manda mesmo assim". É não mandar, gravar por quê,
        e chamar gente quando o motivo for do tipo que só gente resolve.
        ================================================================
      */
      const porta = validarAntesDeEnviar(rascunho, {
        fontesPermitidas: [manual, texto, consultasEmTexto(consultas)],
        exemplos,
        manual,
        memoria: lembrado,
        nomeCliente: primeiroNome(lembrado?.nome ?? nomeCliente),
        contextoDaConversa: contexto,
        mensagemCliente: texto,
      });

      observador.registrar(EVENTOS.VALIDOU, {
        idConversa: conversa.id,
        ok: porta.ok,
        detalhe: porta.ok ? "aprovada" : `${porta.codigo}: ${porta.motivo}`,
      });

      if (!porta.ok) {
        log.alerta(`Barrei a resposta para ${nomeCliente ?? "o cliente"}: ${porta.motivo}`);

        /*
          Malformado e repergunta o bot causou sozinho e nenhum humano
          precisa resolver — a próxima mensagem do cliente tenta de novo.
          Valor inventado, dado de outro cliente, contradição do manual e
          injeção são de outra natureza: alguém tem que olhar.
        */
        if (porta.paraOConsultor) {
          await mandarProConsultor({
            ciclo,
            conversa,
            nomeCliente,
            lembrado,
            pergunta: texto,
            motivo: `resposta barrada — ${porta.motivo}`,
            categoria,
          });
          log.destaque(`→ FILA  ${nomeCliente ?? ""} · ${porta.codigo}`);
        } else {
          /*
            Malformado e repergunta o bot causou sozinho. A conversa
            volta pra ele, mas o cliente não pode ficar sem nada —
            ele mandou uma mensagem e ninguém respondeu.
          */
          await mudarEstagio(conversa.id, "aguardando_bot");
          await avisarQueVaiVerificar({ conversa, nomeCliente, lembrado });
        }
        return;
      }

      const sozinho = await abrirRascunho({
        idConversa: conversa.id,
        texto: rascunho,
        categoria,
        confianca: decisao.confianca,
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
      const manual = await manualDaOperacao();
      const lembrado = await memoria.ler(pendencia.id_conversa);

      /*
        Descarta o aviso de "já te respondo" que ainda não saiu.

        Ele foi enfileirado quando o caso subiu pra Fila. Agora a resposta
        de verdade está chegando — e o cliente receber "deixa eu confirmar
        uma coisa" DEPOIS de receber o valor é pior que não ter recebido
        aviso nenhum. Aconteceu no teste de ponta a ponta.

        A sua resposta ganha de qualquer coisa que o bot tenha enfileirado
        antes dela.
      */
      await supabase
        .from("rascunhos")
        .update({ status: "descartado" })
        .eq("id_conversa", pendencia.id_conversa)
        .eq("status", "aprovado")
        .is("enviado_em", null);

      const texto = await escreverComResposta({
        mensagemCliente: pendencia.pergunta,
        respostaDoConsultor: pendencia.resposta,
        nomeCliente: primeiroNome(conversa?.nome),
        exemplos,
        manual,
        memoria: memoria.emTexto(lembrado),
      });

      /*
        A mesma porta, com uma diferença: aqui número PODE sair, porque o
        dado é seu. O que se confere é se a IA acrescentou algum outro
        enquanto embrulhava a sua resposta.

        Reprovou? Sai a sua resposta como você escreveu. Ela é curta e
        crua, mas é sua e está certa — e o cliente prefere um "4200 em 12x
        de 380" seco a um texto bonito com o número errado.
      */
      const porta = validarAntesDeEnviar(texto, {
        permitirNumeros: true,
        fontesPermitidas: [pendencia.resposta, pendencia.pergunta, manual],
        exemplos,
        manual,
        memoria: lembrado,
        nomeCliente: primeiroNome(conversa?.nome),
        mensagemCliente: pendencia.pergunta,
      });

      observador.registrar(EVENTOS.VALIDOU, {
        idConversa: pendencia.id_conversa,
        ok: porta.ok,
        detalhe: porta.ok ? "aprovada (resposta sua)" : `${porta.codigo}: ${porta.motivo}`,
      });

      const vaiSair = porta.ok ? texto : pendencia.resposta;
      if (!porta.ok) {
        log.alerta(`Barrei o texto da IA (${porta.motivo}). Mandando a sua resposta como está.`);
      }

      await abrirRascunho({
        idConversa: pendencia.id_conversa,
        texto: vaiSair,
        categoria: pendencia.categoria ?? "outro",
        idPendencia: pendencia.id,
        origem: "consultor",
      });

      /*
        ================================================================
        GRAVA O QUE VOCÊ ACABOU DE DIZER AO CLIENTE

        Sem isto, dez minutos depois o cliente escreve "aquele valor" e o
        bot não tem ideia de qual. Ele já respondeu essa pergunta — e não
        lembra que respondeu.

        Procedência 'consultor', gravada junto. É o que permite ao
        validador aceitar esse número depois: ele confere contra esta
        fonte, e recusa qualquer outro.
      */
      const numeros = numerosDeRisco(pendencia.resposta ?? "");
      if (numeros.length) {
        await memoria.guardarSimulacao(pendencia.id_conversa, {
          valor: pendencia.resposta,
          de: "consultor",
        });
      }

      observador.registrar(EVENTOS.CONSULTOR, {
        idConversa: pendencia.id_conversa,
        detalhe: "você respondeu; o agente segue sozinho daqui",
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
