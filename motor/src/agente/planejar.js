import { pensar } from "../ia.js";
import { FERRAMENTAS, catalogo } from "./ferramentas.js";
import { log } from "../log.js";

/*
  ============================================================================
  O MODELO ESCOLHE, O CÓDIGO EXECUTA

  Aqui o modelo faz a única coisa que ele faz melhor que uma regra: olhar
  uma frase em português e dizer o que precisa saber pra responder. "Vocês
  atendem servidor municipal?" pede o manual; "já mandei o contracheque"
  pede a memória.

  O QUE ELE DEVOLVE NÃO É CÓDIGO. É uma lista de nomes com argumentos, e
  cada item só vira execução se:

    - o nome existir no registro          (senão, descartado)
    - a ferramenta for de leitura         (escrita é do orquestrador)
    - os argumentos passarem na validação (no executor, não aqui)

  Por que só leitura: escrever é decidir. Marcar documento recebido, mover
  o funil, chamar o consultor — isso muda o estado do atendimento, e essa
  decisão continua sendo do `decidir.js`, que é código testado. O modelo
  ajuda a enxergar; ele não age.

  O `id_conversa` NUNCA vem do modelo. É preenchido aqui, depois. Deixar um
  id vir do texto gerado seria deixar o modelo escolher de qual cliente ler
  os dados — e uma alucinação viraria vazamento entre conversas.
  ============================================================================
*/

/* Quantas leituras cabem antes de responder. Mais que isso não melhora a
   resposta e só faz o cliente esperar. */
const MAXIMO_NO_PLANO = 3;

/* Desligável sem mexer no código: em máquina lenta, uma chamada a menos
   por mensagem é a diferença entre responder em 6s ou em 12s. */
export const planejadorLigado = process.env.VEZ_PLANEJADOR !== "0";

function montarSistema() {
  const lista = catalogo({ apenasLeitura: true })
    .map((f) => `- ${f.nome}: ${f.resumo}`)
    .join("\n");

  return `Você ajuda um consultor de crédito consignado a atender no WhatsApp.

Antes de responder ao cliente, escolha o que precisa CONSULTAR. Estas são as consultas disponíveis:

${lista}

Responda SOMENTE com JSON:
{"consultas":[{"nome":"buscar_conhecimento","argumentos":{"termo":"prazo"}}]}

Regras:
- No máximo ${MAXIMO_NO_PLANO} consultas.
- Só use nomes da lista acima. Não invente consulta.
- Não passe id de conversa: isso é preenchido pelo sistema.
- buscar_conhecimento é a única que precisa de argumento: "termo", uma palavra ou duas.
- Se a mensagem não precisa de consulta nenhuma, responda {"consultas":[]}.
- NUNCA tente calcular ou consultar valor, parcela, taxa, margem ou saldo. Esse número não está em lugar nenhum aqui.`;
}

/*
  A peneira. Separada da chamada ao modelo de propósito: é aqui que mora
  todo o risco — nome inventado, escrita disfarçada de leitura, id de outro
  cliente — e função pura é função que dá pra testar sem subir modelo nenhum.
*/
export function filtrarPlano(bruto, idConversa) {
  const pedidas = Array.isArray(bruto?.consultas) ? bruto.consultas : [];
  const aceitas = [];

  for (const p of pedidas) {
    if (aceitas.length >= MAXIMO_NO_PLANO) break;

    const nome = typeof p?.nome === "string" ? p.nome.trim() : null;
    const definicao = nome ? FERRAMENTAS[nome] : null;

    if (!definicao) {
      if (nome) log.alerta(`Plano pediu "${nome}", que não existe. Descartei.`);
      continue;
    }

    if (definicao.escrita) {
      log.alerta(`Plano pediu escrita (${nome}). Quem escreve é o orquestrador; descartei.`);
      continue;
    }

    const argumentosDoModelo =
      p.argumentos && typeof p.argumentos === "object" ? p.argumentos : {};

    aceitas.push({
      nome,
      argumentos: {
        // O que o modelo mandou vem primeiro; o id sobrescreve depois, de
        // propósito, pra não haver jeito de ele apontar pra outro cliente.
        ...argumentosDoModelo,
        ...(definicao.argumentos?.id_conversa ? { id_conversa: idConversa } : {}),
      },
    });
  }

  return aceitas;
}

/*
  Pergunta ao modelo e devolve as chamadas já peneiradas.
  Nunca estoura: sem modelo, com JSON quebrado ou com nome inventado, o
  resultado é lista vazia e o agente segue como sempre seguiu.
*/
export async function planejarConsultas({ texto, idConversa }) {
  if (!planejadorLigado) return [];

  try {
    const bruto = await pensar({
      sistema: montarSistema(),
      prompt: `Mensagem do cliente: "${texto}"`,
    });
    return filtrarPlano(bruto, idConversa);
  } catch (erro) {
    log.alerta(`Planejador falhou (${erro.message}); segui sem consultar nada.`);
    return [];
  }
}

/*
  Vira uma linha de texto pro prompt do redator. Só o que ajuda a escrever:
  o resto do JSON só ocuparia espaço no contexto de um modelo pequeno.
*/
export function consultasEmTexto(saidas) {
  const linhas = [];

  for (const s of saidas ?? []) {
    if (!s.ok || !s.dados) continue;

    if (s.nome === "buscar_conhecimento" && s.dados.achou) {
      for (const item of s.dados.itens) {
        linhas.push(`${item.assunto}: ${item.conteudo}`);
      }
    }

    if (s.nome === "consultar_pendencias" && s.dados.falta?.length) {
      linhas.push(
        `Ainda falta deste cliente: ${s.dados.falta.map((f) => f.rotulo).join(", ")}.`
      );
    }

    /*
      A simulação indisponível entra no texto de propósito. É o que faz o
      redator saber que ele NÃO tem o número — sem isso o modelo trata o
      silêncio como permissão pra improvisar.
    */
    if (s.nome === "consultar_simulacao" && s.dados.disponivel === false) {
      linhas.push(
        "Você NÃO tem o valor, a parcela nem a taxa deste cliente. Não escreva número nenhum."
      );
    }
  }

  return linhas.join("\n");
}
