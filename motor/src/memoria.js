import { pensar } from "./ia.js";
import { REQUISITOS } from "./requisitos.js";
import { extrairPorRegra, aindaFalta, pareceTerFato } from "./extrair.js";
import { oQueAAbordagemEnsina } from "./abordagem.js";
import { log } from "./log.js";

/*
  ============================================================================
  O QUE O BOT LEMBRA DE CADA CLIENTE

  Uma linha por conversa. Guarda o que o CLIENTE contou sobre ele mesmo —
  convênio, banco, objetivo, quais documentos já mandou — e nunca o que o
  banco respondeu sobre a proposta. Valor muda a cada simulação e só o
  consultor sabe; se morasse aqui, o bot passaria a repetir número velho.

  A extração roda no modelo LOCAL de propósito: ela lê a mensagem crua do
  cliente, que às vezes fala de dinheiro. Isso não sai da máquina.
  ============================================================================
*/

const CONVENIOS = ["inss", "servidor", "militar", "outro"];
const OBJETIVOS = [
  "reducao_taxa",
  "refinanciamento",
  "emprestimo_novo",
  "portabilidade",
  "duvida",
  "outro",
];

const SISTEMA_DA_EXTRACAO = `Você lê uma mensagem de cliente e extrai APENAS os fatos que ele afirmou explicitamente.

Responda SOMENTE com JSON:
{"nome":null,"convenio":null,"banco":null,"objetivo":null}

Regras:
- nome: só o primeiro nome, e só se ele se apresentou. Não invente a partir do contato.
- convenio: um de inss, servidor, militar, outro. Só se ele disse.
- banco: o nome do banco que ele citou, como ele escreveu.
- objetivo: um de reducao_taxa, refinanciamento, emprestimo_novo, portabilidade, duvida, outro.
- Campo que ele não afirmou fica null. NUNCA deduza.
- NUNCA extraia valor, parcela, saldo, margem ou taxa. Esses não são fatos do cliente.`;

function limpar(valor, permitidos) {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  if (!v || v === "null") return null;
  if (permitidos && !permitidos.includes(v)) return null;
  return v;
}

export function criarMemoria(supabase, userId) {
  function hidratar(registro) {
    if (!registro) return null;
    const perguntado = registro.perguntado && typeof registro.perguntado === "object" ? registro.perguntado : {};
    const recusas =
      registro.recusas && typeof registro.recusas === "object"
        ? registro.recusas
        : perguntado._recusas && typeof perguntado._recusas === "object"
          ? perguntado._recusas
          : {};
    const objecoes = Array.isArray(registro.objecoes_identificadas)
      ? registro.objecoes_identificadas
      : Array.isArray(perguntado._objecoes)
        ? perguntado._objecoes
        : [];
    const ultimaPerguntaAgente =
      registro.ultima_pergunta_agente ?? perguntado._ultima_pergunta_agente ?? null;
    const ultimaPerguntaCliente =
      registro.ultima_pergunta_cliente ?? perguntado._ultima_pergunta_cliente ?? null;
    const contextoCampanha =
      registro.contexto_campanha ?? perguntado._contexto_campanha ?? null;

    return {
      ...registro,
      perguntado,
      recusas,
      objecoes_identificadas: objecoes,
      ultima_pergunta_agente: ultimaPerguntaAgente,
      ultima_pergunta_cliente: ultimaPerguntaCliente,
      contexto_campanha: contextoCampanha,
    };
  }

  async function ler(idConversa) {
    let query = supabase
      .from("memoria")
      .select("*")
      .eq("id_conversa", idConversa);

    if (userId && typeof query.eq === "function") {
      query = query.eq("user_id", userId);
    }

    const { data } = await query.maybeSingle();
    return hidratar(data ?? null);
  }

  async function garantir(idConversa) {
    const existente = await ler(idConversa);
    if (existente) return existente;

    const { data, error } = await supabase
      .from("memoria")
      .insert({ user_id: userId, id_conversa: idConversa })
      .select("*")
      .single();

    // Corrida entre duas mensagens da mesma pessoa: a segunda perde no
    // indice unico e so precisa reler o que a primeira criou.
    if (error) return await ler(idConversa);
    return hidratar(data);
  }

  /*
    Grava só o que ainda não sabíamos. O primeiro relato do cliente vale
    mais que o segundo: se ele disse "Santander" e depois a IA achou que
    era "Bradesco" numa frase ambígua, fica o primeiro.
  */
  async function aprender(idConversa, novosOuCampo, valorPosicional = undefined) {
    const novos =
      typeof novosOuCampo === "string"
        ? { [novosOuCampo]: valorPosicional }
        : novosOuCampo && typeof novosOuCampo === "object"
          ? novosOuCampo
          : {};

    const atual = await garantir(idConversa);
    if (!atual) return null;

    const mudanca = {};
    for (const campo of ["nome", "convenio", "banco", "objetivo"]) {
      if (!atual[campo] && novos[campo]) mudanca[campo] = novos[campo];
    }

    if (novos.coletado) {
      mudanca.coletado = { ...(atual.coletado ?? {}), ...novos.coletado };
    }

    if (Object.keys(mudanca).length === 0) return atual;

    mudanca.atualizado_em = new Date().toISOString();
    const { data } = await supabase
      .from("memoria")
      .update(mudanca)
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    const aprendido = Object.keys(mudanca).filter((k) => k !== "atualizado_em");
    if (aprendido.length) log.info(`   aprendi: ${aprendido.join(", ")}`);

    return hidratar(data ?? { ...atual, ...mudanca });
  }

  /* Conta quantas vezes já pedimos cada coisa — base do anti-loop. */
  async function registrarPergunta(idConversa, chaves = [], textoPergunta = null) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const listaChaves = Array.isArray(chaves) ? chaves : [chaves].filter(Boolean);
    const perguntado = { ...(atual.perguntado ?? {}) };

    for (const chave of listaChaves) {
      perguntado[chave] = {
        ...(perguntado[chave] ?? {}),
        vezes: (perguntado[chave]?.vezes ?? 0) + 1,
        em: agora,
      };
    }

    if (listaChaves.length > 0) {
      perguntado._ultimo_pedido_chaves = listaChaves;
    }

    const perguntaResolvida =
      textoPergunta ||
      (listaChaves[0] && REQUISITOS[listaChaves[0]]?.pedido) ||
      perguntado._ultima_pergunta_agente ||
      null;

    if (perguntaResolvida) {
      perguntado._ultima_pergunta_agente = perguntaResolvida;
      perguntado._ultima_pergunta_em = agora;
    }

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado });
  }

  async function registrarUltimaPerguntaAgente(idConversa, texto, chaves = []) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const perguntado = {
      ...(atual.perguntado ?? {}),
      _ultima_pergunta_agente: String(texto || "").trim(),
      _ultima_pergunta_em: agora,
      ...(Array.isArray(chaves) && chaves.length ? { _ultimo_pedido_chaves: chaves } : {}),
    };

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado });
  }

  async function registrarUltimaPerguntaCliente(idConversa, texto) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const perguntado = {
      ...(atual.perguntado ?? {}),
      _ultima_pergunta_cliente: String(texto || "").trim(),
      _ultima_pergunta_cliente_em: agora,
    };

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado });
  }

  /*
    Registra recusa explícita ou contextual do cliente a um pedido (ex.: "Não",
    "Não vou mandar extrato"). Garante que o mesmo item nunca seja pedido novamente.
  */
  async function registrarRecusa(idConversa, chavesOuAlvo = null, textoCliente = "") {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const perguntado = { ...(atual.perguntado ?? {}) };
    const recusas = { ...(atual.recusas ?? perguntado._recusas ?? {}) };

    let alvos = [];
    if (Array.isArray(chavesOuAlvo) && chavesOuAlvo.length > 0) {
      alvos = chavesOuAlvo;
    } else if (typeof chavesOuAlvo === "string" && chavesOuAlvo.trim()) {
      alvos = [chavesOuAlvo.trim()];
    } else if (Array.isArray(perguntado._ultimo_pedido_chaves) && perguntado._ultimo_pedido_chaves.length > 0) {
      alvos = perguntado._ultimo_pedido_chaves;
    } else {
      const pedidos = Object.entries(perguntado)
        .filter(([chave]) => REQUISITOS[chave])
        .sort((a, b) => new Date(b[1]?.em ?? 0) - new Date(a[1]?.em ?? 0));
      if (pedidos[0]?.[0]) {
        alvos = [pedidos[0][0]];
      }
    }

    if (alvos.length === 0) {
      alvos = ["geral"];
    }

    for (const alvo of alvos) {
      recusas[alvo] = {
        recusado: true,
        vezes: (recusas[alvo]?.vezes ?? 0) + 1,
        em: agora,
        texto: String(textoCliente || "").slice(0, 200),
      };
      if (REQUISITOS[alvo]) {
        perguntado[alvo] = {
          ...(perguntado[alvo] ?? {}),
          vezes: Math.max(perguntado[alvo]?.vezes ?? 1, 2),
          recusado: true,
          recusado_em: agora,
        };
      }
    }

    perguntado._recusas = recusas;

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado, recusas });
  }

  async function registrarObjecao(idConversa, tipo, textoCliente = "") {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const perguntado = { ...(atual.perguntado ?? {}) };
    const lista = Array.isArray(atual.objecoes_identificadas)
      ? [...atual.objecoes_identificadas]
      : [];

    lista.push({
      tipo: String(tipo || "indefinida"),
      texto: String(textoCliente || "").slice(0, 200),
      em: agora,
    });

    perguntado._objecoes = lista.slice(-20);

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado, objecoes_identificadas: perguntado._objecoes });
  }

  /*
    Guarda metadados da campanha (ex.: Botzapzap) separadamente da simulação financeira.
    Campanha NUNCA vira simulação confiável sem confirmação/importação verificável.
  */
  async function guardarContextoCampanha(idConversa, contexto = {}) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const agora = new Date().toISOString();
    const perguntado = {
      ...(atual.perguntado ?? {}),
      _contexto_campanha: {
        ...(atual.contexto_campanha ?? {}),
        ...contexto,
        em: agora,
      },
    };

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: agora })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return hidratar(data ?? { ...atual, perguntado, contexto_campanha: perguntado._contexto_campanha });
  }

  /*
    Chegou arquivo. Não dá pra saber pelo pixel se é contracheque ou
    comprovante — então confirma o que foi pedido por último. É a leitura
    correta na prática: o cliente manda o que você acabou de pedir.
  */
  async function confirmarPeloUltimoPedido(idConversa) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const pedidos = Object.entries(atual.perguntado ?? {})
      .filter(([chave]) => REQUISITOS[chave])
      .sort((a, b) => new Date(b[1].em ?? 0) - new Date(a[1].em ?? 0));

    const alvo = pedidos[0]?.[0];
    if (!alvo) return atual;

    return await aprender(idConversa, {
      coletado: {
        [alvo]: { confirmado: true, em: new Date().toISOString(), como: "cliente" },
      },
    });
  }

  /* ------------------------------------------------------------------
     Estado comercial
  ------------------------------------------------------------------ */

  /*
    O que a própria abordagem do consultor ensina.

    "Oi Ademar, seu contrato Santander…" carrega nome e banco. Isso se
    perdia inteiro, e duas mensagens depois o bot perguntava o banco que ele
    mesmo tinha citado.

    A informação não passa a existir porque o cliente a repetiu — ela já
    estava na conversa.
  */
  async function aprenderDaAbordagem(idConversa, texto) {
    const fatos = oQueAAbordagemEnsina(texto);
    const temAlgo = fatos.nome || fatos.banco || fatos.objetivo;

    await supabase
      .from("memoria")
      .update({
        origem: "prospeccao",
        etapa_comercial: "prospeccao",
        aguardando: "resposta_da_abordagem",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id_conversa", idConversa);

    if (!temAlgo) return await ler(idConversa);

    const depois = await aprender(idConversa, fatos);
    log.info(`   a abordagem já dizia: ${[fatos.nome, fatos.banco].filter(Boolean).join(", ")}`);
    return depois;
  }

  /*
    Guarda o que JÁ FOI DITO ao cliente.

    Esta é a única coisa nesta tabela que é número de dinheiro, e ela tem
    uma regra dura: `de` só aceita 'consultor' ou 'lista'. Modelo não
    escreve aqui, em caminho nenhum.

    Guardar o que VOCÊ disse não é deixar a IA inventar — é o contrário. É o
    que permite, depois, recusar tudo que não seja isto.
  */
  async function guardarSimulacao(
    idConversa,
    { valor, parcela, taxa, prazo, banco, de, idFonte = null, autorizadoPor = null, validadeDias = 7 } = {}
  ) {
    if (de !== "consultor" && de !== "lista") {
      log.erro(`Recusei gravar simulação de origem "${de}". Só consultor ou lista.`);
      return await ler(idConversa);
    }

    const atual = await garantir(idConversa);
    const agoraMs = Date.now();
    const agoraIso = new Date(agoraMs).toISOString();
    const expiraIso = new Date(agoraMs + Number(validadeDias || 7) * 24 * 60 * 60 * 1000).toISOString();

    const anterior = atual?.simulacao ?? {};
    const proximoValor = valor ?? anterior.valor ?? null;
    const proximaParcela = parcela ?? anterior.parcela ?? null;
    const proximaTaxa = taxa ?? anterior.taxa ?? null;
    const proximoPrazo = prazo ?? anterior.prazo ?? null;
    const proximoBanco = banco ?? anterior.banco ?? atual?.banco ?? null;

    const camposAutorizados = [];
    if (proximoValor) camposAutorizados.push("valor");
    if (proximaParcela) camposAutorizados.push("parcela");
    if (proximaTaxa) camposAutorizados.push("taxa");
    if (proximoPrazo) camposAutorizados.push("prazo");
    if (proximoBanco) camposAutorizados.push("banco");

    const simulacao = {
      ...anterior,
      ...(proximoValor ? { valor: proximoValor } : {}),
      ...(proximaParcela ? { parcela: proximaParcela } : {}),
      ...(proximaTaxa ? { taxa: proximaTaxa } : {}),
      ...(proximoPrazo ? { prazo: proximoPrazo } : {}),
      ...(proximoBanco ? { banco: proximoBanco } : {}),
      de,
      idFonte: idFonte ?? anterior.idFonte ?? null,
      autorizadoPor: autorizadoPor ?? (de === "consultor" ? "consultor_humano" : "lista_verificada"),
      em: agoraIso,
      expiraEm: expiraIso,
      valida: true,
      camposAutorizados,
    };

    const { data } = await supabase
      .from("memoria")
      .update({
        simulacao,
        etapa_comercial: "documentos",
        aguardando: null,
        atualizado_em: agoraIso,
      })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    log.info(`   guardei a simulação que ${de === "lista" ? "veio da lista" : "você passou"}.`);
    return hidratar(data ?? { ...atual, simulacao });
  }

  /* Move a negociação. Quem move é o agente, olhando o que aconteceu. */
  async function mudarEtapaComercial(idConversa, etapa, aguardando = undefined) {
    const { data } = await supabase
      .from("memoria")
      .update({
        etapa_comercial: etapa,
        ...(aguardando === undefined ? {} : { aguardando }),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id_conversa", idConversa)
      .select("*")
      .maybeSingle();

    return data;
  }

  async function registrarAcao(idConversa, acao, motivo) {
    await supabase
      .from("memoria")
      .update({
        ultima_acao: acao,
        ultimo_motivo: motivo ?? null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id_conversa", idConversa);
  }

  /*
    Lê a mensagem e devolve os fatos novos. Só chama a IA se ainda falta
    algo pra descobrir — não faz sentido gastar 6 segundos extraindo o
    convênio de quem já disse que é do INSS.
  */
  async function extrairDaMensagem(texto, memoriaAtual) {
    /*
      ================================================================
      A REGRA PRIMEIRO, O MODELO DEPOIS

      Medido: o llama3.2:3b acertava 2 de 9 extrações e levava dezenas de
      segundos em cada uma. "Sou aposentado do INSS" voltava vazio, e o
      bot perguntava ao cliente o convênio que ele tinha acabado de dizer.

      A regra resolve o caso comum em microssegundos e sem errar. O modelo
      só é chamado pelo que sobrou — e se não sobrou nada, não é chamado.
      ================================================================
    */
    const porRegra = extrairPorRegra(texto);

    if (!aindaFalta(memoriaAtual, porRegra)) return porRegra;

    /*
      Faltar campo não basta pra justificar a chamada. No começo da conversa
      falta TUDO — e é exatamente quando chegam as mensagens mais curtas.
      "Oi, boa tarde" gastava 18 segundos de modelo pra voltar vazio.
    */
    if (!pareceTerFato(texto)) return porRegra;

    const bruto = await pensar({
      sistema: SISTEMA_DA_EXTRACAO,
      prompt: `Mensagem do cliente: "${texto}"`,
    });

    if (!bruto) return porRegra;

    /*
      A regra ganha do modelo em todo campo que ela preencheu. Ela erra
      menos e, quando erra, erra de um jeito que dá pra corrigir lendo o
      arquivo — o modelo erra de um jeito que só aparece em produção.
    */
    const doModelo = {
      nome:
        typeof bruto.nome === "string" && bruto.nome.trim().length > 1
          ? bruto.nome.trim().split(/\s+/)[0]
          : null,
      convenio: limpar(bruto.convenio, CONVENIOS),
      banco: typeof bruto.banco === "string" && bruto.banco.trim() ? bruto.banco.trim() : null,
      objetivo: limpar(bruto.objetivo, OBJETIVOS),
    };

    return {
      nome: porRegra.nome ?? doModelo.nome,
      convenio: porRegra.convenio ?? doModelo.convenio,
      banco: porRegra.banco ?? doModelo.banco,
      objetivo: porRegra.objetivo ?? doModelo.objetivo,
    };
  }

  /* Vira texto pro prompt do redator: o que ele já sabe sobre esta pessoa. */
  function emTexto(memoria) {
    if (!memoria) return "";
    const partes = [];
    if (memoria.nome) partes.push(`nome: ${memoria.nome}`);
    if (memoria.convenio) partes.push(`convênio: ${memoria.convenio}`);
    if (memoria.banco) partes.push(`banco: ${memoria.banco}`);
    if (memoria.objetivo) partes.push(`quer: ${memoria.objetivo.replace(/_/g, " ")}`);

    const entregues = Object.entries(memoria.coletado ?? {})
      .filter(([, v]) => v?.confirmado)
      .map(([k]) => REQUISITOS[k]?.rotulo ?? k);
    if (entregues.length) partes.push(`já mandou: ${entregues.join(", ")}`);

    const recusasMapa = memoria.recusas ?? memoria.perguntado?._recusas ?? {};
    const itensRecusados = Object.keys(recusasMapa)
      .filter((k) => recusasMapa[k]?.recusado)
      .map((k) => REQUISITOS[k]?.rotulo ?? k);
    if (itensRecusados.length) {
      partes.push(`recusou enviar (NÃO peça novamente): ${itensRecusados.join(", ")}`);
    }

    const ultimaPergunta =
      memoria.ultima_pergunta_agente ?? memoria.perguntado?._ultima_pergunta_agente ?? null;
    if (ultimaPergunta) {
      partes.push(`última pergunta feita pelo agente: "${ultimaPergunta}"`);
    }

    return partes.length ? `O que você já sabe deste cliente — ${partes.join(" · ")}.` : "";
  }

  return {
    ler,
    garantir,
    aprender,
    aprenderDaAbordagem,
    guardarSimulacao,
    guardarContextoCampanha,
    mudarEtapaComercial,
    registrarPergunta,
    registrarUltimaPerguntaAgente,
    registrarUltimaPerguntaCliente,
    registrarRecusa,
    registrarObjecao,
    confirmarPeloUltimoPedido,
    registrarAcao,
    extrairDaMensagem,
    emTexto,
  };
}
