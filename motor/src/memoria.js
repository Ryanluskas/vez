import { pensar } from "./ia.js";
import { REQUISITOS } from "./requisitos.js";
import { extrairPorRegra, aindaFalta, pareceTerFato } from "./extrair.js";
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
  async function ler(idConversa) {
    const { data } = await supabase
      .from("memoria")
      .select("*")
      .eq("id_conversa", idConversa)
      .maybeSingle();
    return data ?? null;
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
    return data;
  }

  /*
    Grava só o que ainda não sabíamos. O primeiro relato do cliente vale
    mais que o segundo: se ele disse "Santander" e depois a IA achou que
    era "Bradesco" numa frase ambígua, fica o primeiro.
  */
  async function aprender(idConversa, novos) {
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

    return data ?? atual;
  }

  /* Conta quantas vezes já pedimos cada coisa — base do anti-loop. */
  async function registrarPergunta(idConversa, chaves) {
    const atual = await garantir(idConversa);
    if (!atual) return null;

    const perguntado = { ...(atual.perguntado ?? {}) };
    for (const chave of chaves) {
      perguntado[chave] = {
        vezes: (perguntado[chave]?.vezes ?? 0) + 1,
        em: new Date().toISOString(),
      };
    }

    const { data } = await supabase
      .from("memoria")
      .update({ perguntado, atualizado_em: new Date().toISOString() })
      .eq("id_conversa", idConversa)
      .select("*")
      .single();

    return data ?? atual;
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

    return partes.length ? `O que você já sabe deste cliente — ${partes.join(" · ")}.` : "";
  }

  return {
    ler,
    garantir,
    aprender,
    registrarPergunta,
    confirmarPeloUltimoPedido,
    registrarAcao,
    extrairDaMensagem,
    emTexto,
  };
}
