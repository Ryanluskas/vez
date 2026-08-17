import { ETAPAS } from "../funil.js";
import { REQUISITOS, queFalta, montarPedido, prontoPara } from "../requisitos.js";
import { numerosDeRisco } from "../numeros.js";

/*
  ============================================================================
  AS FERRAMENTAS DO AGENTE

  Cada ferramenta é uma ação com nome, contrato de argumentos e dono. O
  modelo pode ESCOLHER qual usar; ele nunca escreve a chamada. O que sai
  dele é `{"nome":"atualizar_etapa","argumentos":{...}}` — texto que só vira
  execução depois de bater com uma definição daqui e passar na validação.

  A diferença não é estética. Se o modelo pudesse montar a chamada, ele
  poderia montar `atualizar_memoria({valor: 4200})` numa conversa em que
  ninguém falou em 4200 — e a memória viraria fonte de um número inventado,
  que depois sairia numa mensagem com toda a cara de dado conferido.

  TRÊS REGRAS QUE VALEM PRA TODAS

  1. Nenhuma ferramenta devolve valor, parcela, juros, margem ou saldo.
     Esse número não mora no banco de dados do produto — mora no sistema do
     banco, e quem tem acesso é o consultor.

  2. Ferramenta marcada `semDinheiro` recusa argumento que contenha número
     de dinheiro, mesmo que o resto esteja perfeito. É a barreira contra o
     modelo "guardar" um valor que ele deduziu.

  3. Ferramenta que ainda não tem integração real diz isso na cara
     (`disponivel: false`) em vez de devolver algo plausível. Um número
     inventado com formato bonito é pior que um erro.
  ============================================================================
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVES = Object.keys(REQUISITOS);
const COMO = ["cliente", "consultor", "sistema"];

/* ------------------------------------------------------------------
   Validação de argumentos

   Cada ferramenta declara o que aceita. Nada de esquema genérico esperto:
   seis tipos cobrem tudo que existe aqui, e um validador que cabe na tela
   é um validador que alguém consegue auditar.
------------------------------------------------------------------ */

const TIPOS = {
  uuid: (v) => (typeof v === "string" && UUID.test(v) ? { ok: true, valor: v } : { ok: false, erro: "não é um id válido" }),

  texto: (v) => {
    if (typeof v !== "string") return { ok: false, erro: "precisa ser texto" };
    const t = v.trim();
    if (!t) return { ok: false, erro: "veio vazio" };
    if (t.length > 500) return { ok: false, erro: "texto longo demais" };
    return { ok: true, valor: t };
  },

  booleano: (v) => (typeof v === "boolean" ? { ok: true, valor: v } : { ok: false, erro: "precisa ser sim ou não" }),

  etapa: (v) => (ETAPAS.includes(v) ? { ok: true, valor: v } : { ok: false, erro: `etapa desconhecida (use: ${ETAPAS.join(", ")})` }),

  requisito: (v) => (CHAVES.includes(v) ? { ok: true, valor: v } : { ok: false, erro: `não é um requisito da operação (use: ${CHAVES.join(", ")})` }),

  como: (v) => (COMO.includes(v) ? { ok: true, valor: v } : { ok: false, erro: `origem inválida (use: ${COMO.join(", ")})` }),
};

/*
  Devolve os argumentos limpos, ou a lista de problemas. Argumento que a
  ferramenta não declarou é DESCARTADO, não rejeitado: o modelo às vezes
  acrescenta um campo a mais, e derrubar a chamada inteira por causa disso
  transformaria um detalhe em falha de atendimento.
*/
export function validarArgumentos(definicao, argumentos) {
  const problemas = [];
  const limpos = {};
  const recebidos = argumentos && typeof argumentos === "object" ? argumentos : {};

  for (const [nome, regra] of Object.entries(definicao.argumentos ?? {})) {
    const bruto = recebidos[nome];

    if (bruto === undefined || bruto === null) {
      if (regra.obrigatorio) problemas.push(`falta ${nome}`);
      else if (regra.padrao !== undefined) limpos[nome] = regra.padrao;
      continue;
    }

    const checar = TIPOS[regra.tipo];
    if (!checar) {
      problemas.push(`tipo ${regra.tipo} não existe`);
      continue;
    }

    const r = checar(bruto);
    if (!r.ok) problemas.push(`${nome}: ${r.erro}`);
    else limpos[nome] = r.valor;
  }

  /*
    A regra de ouro, no ponto em que o dado ENTRA. Barrar só na saída seria
    tarde: um valor gravado na memória volta depois como se fosse fato
    apurado, e nesse ponto ninguém mais lembra que a IA o inventou.
  */
  if (definicao.semDinheiro && problemas.length === 0) {
    /*
      Só os campos de TEXTO LIVRE. Um uuid é `1111-2222-3333` — puro dígito,
      e o detector de dinheiro o lia como três valores. Sem este filtro,
      toda escrita era recusada por "inventar" o próprio id da conversa, e
      a memória do cliente nunca gravaria nada.

      Filtrar por tipo declarado, e não por formato do valor, é o que
      mantém isso correto quando um campo novo for acrescentado.
    */
    const livres = Object.entries(limpos)
      .filter(([nome]) => definicao.argumentos[nome]?.tipo === "texto")
      .map(([, v]) => v)
      .filter((v) => typeof v === "string");

    const dinheiro = numerosDeRisco(livres.join(" "));
    if (dinheiro.length) {
      problemas.push(
        `argumento com número de dinheiro (${dinheiro.join(", ")}); esse dado só vem de você`
      );
    }
  }

  return { ok: problemas.length === 0, argumentos: limpos, problemas };
}

/* ------------------------------------------------------------------
   As ferramentas
------------------------------------------------------------------ */

export const FERRAMENTAS = {
  /* ---------------------------------------------------------- leitura */

  consultar_cliente: {
    escrita: false,
    resumo: "Quem é este cliente: nome, convênio, banco, o que ele quer, em que etapa está e se tem pergunta na sua fila.",
    argumentos: { id_conversa: { tipo: "uuid", obrigatorio: true } },

    async executar({ id_conversa }, { supabase }) {
      const [conversa, memoria, fila] = await Promise.all([
        supabase
          .from("conversas")
          .select("id, nome, telefone, etapa, estagio, atender, seguir, so_voce, followups_enviados")
          .eq("id", id_conversa)
          .maybeSingle(),
        supabase.from("memoria").select("*").eq("id_conversa", id_conversa).maybeSingle(),
        supabase
          .from("pendencias")
          .select("id", { count: "exact", head: true })
          .eq("id_conversa", id_conversa)
          .eq("status", "aberta"),
      ]);

      if (!conversa.data) return { encontrado: false };

      const m = memoria.data;
      return {
        encontrado: true,
        nome: m?.nome ?? conversa.data.nome ?? null,
        convenio: m?.convenio ?? null,
        banco: m?.banco ?? null,
        objetivo: m?.objetivo ?? null,
        etapa: conversa.data.etapa,
        atendendo: conversa.data.atender === true && conversa.data.so_voce !== true,
        esperando_voce: (fila.count ?? 0) > 0,
        ja_entregou: Object.entries(m?.coletado ?? {})
          .filter(([, v]) => v?.confirmado)
          .map(([k]) => k),
      };
    },
  },

  consultar_memoria: {
    escrita: false,
    resumo: "Só o que o bot lembra deste cliente, sem o estado da conversa.",
    argumentos: { id_conversa: { tipo: "uuid", obrigatorio: true } },

    async executar({ id_conversa }, { memoria }) {
      const m = await memoria.ler(id_conversa);
      if (!m) return { lembra: false };

      return {
        lembra: true,
        nome: m.nome,
        convenio: m.convenio,
        banco: m.banco,
        objetivo: m.objetivo,
        coletado: Object.keys(m.coletado ?? {}).filter((k) => m.coletado[k]?.confirmado),
        ja_perguntei: Object.fromEntries(
          Object.entries(m.perguntado ?? {}).map(([k, v]) => [k, v?.vezes ?? 0])
        ),
        ultima_acao: m.ultima_acao ?? null,
      };
    },
  },

  buscar_conhecimento: {
    escrita: false,
    resumo: "Procura no que você ensinou sobre a operação (prazos, convênios atendidos, documentos, horários).",
    argumentos: { termo: { tipo: "texto", obrigatorio: true } },

    async executar({ termo }, { supabase }) {
      /*
        Duas buscas porque o assunto é curto e o conteúdo é longo: quem
        escreve "prazo" acha o tópico pelo título, quem escreve "quanto
        tempo cai" acha pelo corpo. Uma consulta só perderia metade.
      */
      const palavra = `%${termo.replace(/[%_]/g, "")}%`;
      const { data, error } = await supabase
        .from("conhecimento")
        .select("assunto, conteudo")
        .or(`assunto.ilike.${palavra},conteudo.ilike.${palavra}`)
        .limit(3);

      // Tabela ainda não criada: é ausência de dado, não erro de execução.
      if (error) return { achou: false, motivo: "o manual da operação ainda não existe" };
      if (!data?.length) return { achou: false, motivo: `você não ensinou nada sobre "${termo}"` };

      return { achou: true, itens: data.map((d) => ({ assunto: d.assunto, conteudo: d.conteudo })) };
    },
  },

  consultar_pendencias: {
    escrita: false,
    resumo: "O que ainda falta deste cliente pra poder simular ou fechar, e o que já foi pedido demais.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      para: { tipo: "texto", padrao: "simular" },
    },

    async executar({ id_conversa, para }, { memoria }) {
      const alvo = para === "fechar" ? "fechar" : "simular";
      const m = await memoria.ler(id_conversa);

      const falta = queFalta(m, { para: alvo });
      const pedido = montarPedido(m, { para: alvo });

      return {
        para: alvo,
        pronto: prontoPara(m, { para: alvo }),
        falta: falta.map((c) => ({ chave: c, rotulo: REQUISITOS[c].rotulo })),
        /*
          O que dá pra pedir AGORA já vem montado — é o mesmo `montarPedido`
          que o orquestrador usa. Se o modelo montasse a frase sozinho, ele
          pediria coisa que a operação não usa.
        */
        posso_pedir: pedido ? { chaves: pedido.chaves, texto: pedido.texto } : null,
        // Sem nada pedível mas ainda faltando coisa = já insisti demais.
        insisti_demais: falta.length > 0 && !pedido,
      };
    },
  },

  /*
    A ferramenta que era só um contrato vazio, e agora tem fonte.

    O corpo mudou; o contrato não. Quem chama continua perguntando "você tem
    o valor deste cliente?" e continua tratando `disponivel: false` como o
    caminho normal — que é o que acontece sempre que o cliente não está em
    nenhuma lista, ou o consultor não liberou campo nenhum.

    Não existe integração com o sistema do banco. O que existe é a planilha
    que o consultor apurou e subiu. A diferença importa: os números aqui são
    de quando a planilha foi feita, não de agora.
  */
  consultar_simulacao: {
    escrita: false,
    resumo: "Valores deste cliente, se ele estiver numa lista que você subiu.",
    argumentos: { id_conversa: { tipo: "uuid", obrigatorio: true } },

    async executar({ id_conversa }, { supabase, lista }) {
      if (!lista) {
        return {
          disponivel: false,
          motivo: "nenhuma lista configurada",
          proximo_passo: "solicitar_intervencao",
        };
      }

      const { data: conversa } = await supabase
        .from("conversas")
        .select("telefone")
        .eq("id", id_conversa)
        .maybeSingle();

      const achado = conversa?.telefone ? await lista.valoresPara(conversa.telefone) : null;

      if (!achado) {
        return {
          disponivel: false,
          motivo: "este cliente não está em nenhuma lista ativa; o valor só você tem",
          proximo_passo: "solicitar_intervencao",
        };
      }

      /*
        Os números saem daqui JÁ com a porcentagem aplicada. O modelo nunca
        vê o valor cheio, então não tem como "arredondar de volta" pra ele.
      */
      return {
        disponivel: true,
        de: achado.lista,
        nome_na_lista: achado.nome,
        valores: achado.valores,
        texto: achado.texto,
      };
    },
  },

  /* ----------------------------------------------------------- escrita */

  atualizar_memoria: {
    escrita: true,
    semDinheiro: true,
    resumo: "Guarda o que o cliente contou sobre ele: nome, convênio, banco, objetivo.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      nome: { tipo: "texto" },
      convenio: { tipo: "texto" },
      banco: { tipo: "texto" },
      objetivo: { tipo: "texto" },
    },

    async executar({ id_conversa, ...fatos }, { memoria }) {
      const novos = Object.fromEntries(
        Object.entries(fatos).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(novos).length === 0) return { gravou: false, motivo: "nenhum fato novo" };

      /*
        `aprender` só grava campo vazio: o primeiro relato do cliente vale
        mais que a segunda leitura do modelo numa frase ambígua.
      */
      const antes = await memoria.ler(id_conversa);
      const depois = await memoria.aprender(id_conversa, novos);

      const mudou = ["nome", "convenio", "banco", "objetivo"].filter(
        (c) => antes?.[c] !== depois?.[c]
      );

      return { gravou: mudou.length > 0, campos: mudou };
    },
  },

  marcar_informacao_coletada: {
    escrita: true,
    resumo: "Marca que o cliente já entregou um documento ou informação.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      chave: { tipo: "requisito", obrigatorio: true },
      como: { tipo: "como", padrao: "cliente" },
    },

    async executar({ id_conversa, chave, como }, { memoria }) {
      await memoria.aprender(id_conversa, {
        coletado: { [chave]: { confirmado: true, em: new Date().toISOString(), como } },
      });
      return { marcado: chave, rotulo: REQUISITOS[chave].rotulo };
    },
  },

  atualizar_etapa: {
    escrita: true,
    resumo: "Move o cliente no funil de venda.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      etapa: { tipo: "etapa", obrigatorio: true },
    },

    async executar({ id_conversa, etapa }, { supabase }) {
      /*
        'fechado' e 'perdido' são conclusões sobre dinheiro que entrou ou
        não entrou. Quem decide isso é o consultor, no painel — o bot não
        tem como saber se a proposta foi averbada.
      */
      if (etapa === "fechado" || etapa === "perdido") {
        return {
          mudou: false,
          motivo: `só você pode marcar como ${etapa}; o bot não vê o resultado da proposta`,
        };
      }

      const { error } = await supabase
        .from("conversas")
        .update({ etapa, atualizado_em: new Date().toISOString() })
        .eq("id", id_conversa);

      if (error) throw new Error(error.message);
      return { mudou: true, etapa };
    },
  },

  registrar_documento_recebido: {
    escrita: true,
    resumo: "Chegou arquivo do cliente: marca o documento como entregue e move o funil.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      chave: { tipo: "requisito" },
    },

    async executar({ id_conversa, chave }, { supabase, memoria }) {
      /*
        Sem `chave`, confirma o que foi pedido por último. Não dá pra saber
        pelo pixel se a foto é contracheque ou comprovante, e na prática o
        cliente manda o que você acabou de pedir.
      */
      const m = chave
        ? await memoria.aprender(id_conversa, {
            coletado: { [chave]: { confirmado: true, em: new Date().toISOString(), como: "cliente" } },
          })
        : await memoria.confirmarPeloUltimoPedido(id_conversa);

      const { error } = await supabase
        .from("conversas")
        .update({
          etapa: "documentos_recebidos",
          followups_enviados: 0,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id_conversa);

      if (error) throw new Error(error.message);

      const confirmados = Object.entries(m?.coletado ?? {})
        .filter(([, v]) => v?.confirmado)
        .map(([k]) => k);

      return { registrado: true, coletado: confirmados };
    },
  },

  criar_followup: {
    escrita: true,
    resumo: "Volta a cobrar este cliente se ele esfriar. Não escolhe a hora: quem decide é o funil.",
    argumentos: { id_conversa: { tipo: "uuid", obrigatorio: true } },

    async executar({ id_conversa }, { supabase }) {
      /*
        Isto NÃO agenda mensagem pra uma hora escolhida pelo modelo. Liga a
        cobrança e zera o contador; `funil.js` decide quando sai, com
        intervalo crescente e janela de horário. Deixar o modelo escolher a
        hora seria mensagem de madrugada na primeira vez que ele errasse o
        fuso — e aposentado bloqueia.
      */
      const { error } = await supabase
        .from("conversas")
        .update({ seguir: true, followups_enviados: 0, ultimo_followup_em: null })
        .eq("id", id_conversa);

      if (error) throw new Error(error.message);
      return { seguindo: true, quando: "o funil decide, entre 8h e 20h" };
    },
  },

  cancelar_followup: {
    escrita: true,
    resumo: "Para de cobrar este cliente. Use quando ele pedir pra não insistirem.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      motivo: { tipo: "texto" },
    },

    async executar({ id_conversa }, { supabase }) {
      const { error } = await supabase
        .from("conversas")
        .update({ seguir: false })
        .eq("id", id_conversa);

      if (error) throw new Error(error.message);
      return { seguindo: false };
    },
  },

  solicitar_intervencao: {
    escrita: true,
    resumo: "Manda o caso pra sua fila. É o caminho de tudo que envolve valor, parcela, taxa ou saldo.",
    argumentos: {
      id_conversa: { tipo: "uuid", obrigatorio: true },
      pergunta: { tipo: "texto", obrigatorio: true },
      motivo: { tipo: "texto", obrigatorio: true },
      categoria: { tipo: "texto", padrao: "outro" },
    },

    async executar({ id_conversa, pergunta, motivo, categoria }, { abrirPendencia, memoria, contextoDaConversa }) {
      const id = await abrirPendencia({
        idConversa: id_conversa,
        pergunta,
        contexto: await contextoDaConversa(id_conversa),
        categoria,
        motivo,
        memoria: await memoria.ler(id_conversa),
      });

      // null = já havia pendência aberta. Não é erro: é uma pessoa na fila,
      // não duas, mesmo que ela mande três mensagens seguidas.
      return id
        ? { na_fila: true, id }
        : { na_fila: true, id: null, motivo: "esta conversa já estava esperando você" };
    },
  },
};

/* Só o que o modelo pode escolher: nome + resumo, sem detalhe de execução. */
export function catalogo({ apenasLeitura = false } = {}) {
  return Object.entries(FERRAMENTAS)
    .filter(([, d]) => (apenasLeitura ? !d.escrita : true))
    .map(([nome, d]) => ({
      nome,
      resumo: d.resumo,
      argumentos: Object.entries(d.argumentos ?? {}).map(([a, r]) =>
        r.obrigatorio ? a : `${a}?`
      ),
      disponivel: d.disponivel !== false,
    }));
}
