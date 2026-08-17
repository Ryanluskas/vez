import { checarGatilhos } from "./gatilhos.js";
import { gerarJson } from "./ollama.js";

/*
  Categorias fixas de proposito. Elas sao as gavetas do "Meu jeito": se o
  modelo pudesse inventar categoria, cada resposta boa cairia numa gaveta
  diferente e o few-shot nunca acharia exemplo parecido pra usar.
*/
export const CATEGORIAS = [
  "saudacao",
  "documentos",
  "prazo",
  "horario",
  "elegibilidade",
  "acompanhamento",
  "valor",
  "outro",
];

/*
  As mensagens que se classificam sozinhas.

  Cada padrão aqui é uma frase que aparece dezenas de vezes por dia e cuja
  categoria nunca é ambígua. `precisaDoRyan: false` só onde a resposta é
  genérica — nada aqui depende de um dado do cliente.

  Mensagem longa não entra: quanto mais texto, maior a chance de ter mais de
  um assunto, e aí a regra chuta. O corte é conservador de propósito.
*/
const TAMANHO_MAXIMO_DA_REGRA = 90;

/*
  TODO padrão aqui é ancorado no começo E no fim.

  A primeira versão não era, e o próprio teste pegou o buraco: "quais
  documentos e quanto eu pego?" casava com o pedaço "quais documentos" e era
  classificada como pergunta genérica, com `precisaDoRyan: false`. A segunda
  metade da frase — a que vale dinheiro — sumia.

  Mensagem com dois assuntos não é óbvia. Se não casa inteira, vai pro
  modelo, que é onde ela deveria ter ido desde o começo.
*/
const SAUDACAO = "(?:oi+|ol[aá]|e a[ií]|opa|bom dia|boa tarde|boa noite|tudo bem|tudo bom|blz|beleza)";
const FIM = "[\\s!?.,…]*";

/*
  O resto da frase, e só palavra que já sabemos ser inofensiva.

  É lista de PERMISSÃO, não de proibição, e a diferença é o que segura a
  regra de ouro: palavra que eu não previ faz a frase deixar de ser óbvia e
  ir pro modelo. Uma lista de proibição faria o contrário — o desconhecido
  passaria, e foi assim que "quais documentos e quanto eu pego" quase saiu
  liberado.
*/
const RESTO_INOFENSIVO =
  "(?:\\s+(?:eu|voc[êe]|vc|preciso|precisa|tenho|que|levar|mandar|enviar|separar|" +
  "apresentar|providenciar|para|pra|pro|de|do|da|dos|das|os|as|o|a|um|uma|" +
  "meu|minha|ai|a[íi]|hein|mesmo|ent[ãa]o|agora|hoje|por favor|pfv))*";

const OBVIAS = [
  /*
    Cumprimento repetido, não um seguido de uma lista fixa.

    A primeira versão aceitava "bom dia" e depois só "tudo bem|tudo bom|como
    vai". Aí chegou "oi, boa tarde" — dois cumprimentos — e foi parar no
    modelo, que levou 21 segundos pra devolver "outro, precisa do consultor".
    Uma saudação virando pendência é o pior caso possível: o cliente escreve
    "oi" e o consultor recebe uma tarefa.

    Até três, porque "oi, bom dia, tudo bem?" existe e "oi oi oi oi" não é
    mais saudação, é outra coisa.
  */
  ["saudacao", new RegExp(`^(?:${SAUDACAO}${FIM}){1,3}$`, "i")],
  [
    "saudacao",
    /^(?:obrigad[oa]|vlw|valeu|muito obrigad[oa]|agradeço|agradecido|show|ótimo|otimo|perfeito|legal|entendi|ok|okay|certo|tá bom|ta bom|blz)[\s!?.,…]*$/i,
  ],
  [
    "horario",
    new RegExp(
      `^(?:${SAUDACAO}${FIM})?` +
        `(?:que horas? (?:voc[êe]s? )?(?:abre|fecha|atende)|hor[áa]rio de (?:atendimento|funcionamento)|` +
        `(?:voc[êe]s? )?atende(?:m)? (?:no |aos? )?(?:s[áa]bado|domingo|fim de semana|feriado))` +
        `${FIM}$`,
      "i"
    ),
  ],
  [
    "documentos",
    new RegExp(
      `^(?:${SAUDACAO}${FIM})?` +
        `(?:quais? (?:s[ãa]o os )?documentos?|que documentos?|quais? pap[ée]is|` +
        `o que (?:eu )?preciso (?:levar|mandar|enviar))` +
        RESTO_INOFENSIVO +
        `${FIM}$`,
      "i"
    ),
  ],
  /*
    Prazo. "Quanto tempo demora" é a pergunta mais repetida do ramo, e a
    resposta está no seu manual — não depende de nenhum dado do cliente.

    Ela ia parar no modelo, que devolvia "precisa do consultor", e aí o
    agente pedia o extrato de margem pra responder quanto tempo demora. O
    cliente perguntava sobre prazo e recebia pedido de documento.

    "Quanto tempo" nunca é dinheiro — o gatilho já tem essa exceção
    explícita, e ela existe desde o começo pelo mesmo motivo.
  */
  [
    "prazo",
    new RegExp(
      `^(?:${SAUDACAO}${FIM})?` +
        `(?:(?:e\\s+)?(?:depois que (?:eu )?assin\\w+[,\\s]+)?)?` +
        `(?:quanto tempo|demora quanto|em quantos? dias?|quando (?:que )?(?:cai|entra|fica pronto|sai))` +
        `(?:\\s+(?:demora|leva|dura|cai|caem|entra|[ée]|vai|pra|para|pro|o|a|de|em|at[ée]|` +
        `cair|entrar|ficar|sair|pronto|dinheiro|dep[oó]sito|liberar|na conta|conta))*` +
        `${FIM}$`,
      "i"
    ),
  ],
];

export function classificarPorRegra(texto) {
  const t = String(texto ?? "").trim();
  if (!t || t.length > TAMANHO_MAXIMO_DA_REGRA) return null;

  /*
    Cinto e suspensório: o gatilho já rodou antes desta função, mas ela é
    exportada e testada sozinha. Se um dia alguém chamá-la primeiro, ela
    ainda se recusa a liberar assunto de dinheiro.
  */
  if (checarGatilhos(t).travou) return null;

  for (const [categoria, padrao] of OBVIAS) {
    if (!padrao.test(t)) continue;
    return {
      categoria,
      precisaDoRyan: false,
      motivo: null,
      // Não é regra rígida no sentido do gatilho — aquela FORÇA o consultor.
      // Esta só reconhece o óbvio, então a confiança fica com o classificador.
      decidiuNaRegra: false,
      semModelo: true,
    };
  }

  return null;
}

const SISTEMA = `Você classifica mensagens que clientes mandam para um consultor de crédito consignado no WhatsApp.

Responda SOMENTE com JSON neste formato:
{"categoria": "...", "precisa_do_ryan": true}

categoria tem que ser exatamente uma destas:
- saudacao: cumprimento, agradecimento, conversa fiada
- documentos: quais papéis enviar, foto de documento, onde assinar
- prazo: quanto tempo demora, quando fica pronto, quando cai
- horario: horário de atendimento, dia de funcionamento, se pode ligar
- elegibilidade: se pode fazer, se tem direito, qual banco, qual convênio
- acompanhamento: status do contrato, "já saiu?", "tem novidade?"
- valor: qualquer coisa sobre quantia, parcela, saldo, margem, juros, simulação
- outro: não encaixa em nenhuma acima

precisa_do_ryan é true quando a resposta depende de um dado específico daquele
cliente que só o consultor tem. É false apenas para perguntas genéricas, que
qualquer atendente responderia sem consultar nada.

Se a mensagem tocar em dinheiro de qualquer forma, precisa_do_ryan é true.
Na dúvida, true.`;

/*
  Devolve sempre:
  { categoria, precisaDoRyan, motivo, decidiuNaRegra }

  A ordem importa. A regra rigida roda PRIMEIRO e, se travar, a IA nem e
  chamada — economiza CPU e, mais importante, tira do modelo a chance de
  opinar sobre dinheiro.
*/
export async function classificar({ texto, contexto }) {
  const gatilho = checarGatilhos(texto);

  if (gatilho.travou) {
    return {
      categoria: "valor",
      precisaDoRyan: true,
      motivo: gatilho.motivo,
      decidiuNaRegra: true,
    };
  }

  /*
    ==================================================================
    O ÓBVIO NÃO PRECISA DE MODELO

    "Bom dia" é saudação. Isso não é interpretação de linguagem, é
    reconhecimento de palavra — e custava 30 a 120 segundos de CPU pra
    chegar na mesma resposta.

    Só o que NÃO casa com nenhum padrão daqui vai pro modelo. Ele
    continua sendo chamado pra frase torta, que é onde ele ganha da
    regra.

    Nenhum padrão aqui libera o bot em assunto de dinheiro: os gatilhos
    já rodaram acima e cortaram tudo que cheira a valor. O que sobra
    aqui é conversa que não toca em número.
    ==================================================================
  */
  const obvia = classificarPorRegra(texto);
  if (obvia) return obvia;

  const resposta = await gerarJson({
    sistema: SISTEMA,
    prompt: contexto
      ? `Conversa até agora:\n${contexto}\n\nClassifique a última mensagem do cliente: "${texto}"`
      : `Classifique esta mensagem do cliente: "${texto}"`,
  });

  // Ollama fora do ar, travado ou cuspindo bobagem: vai pra fila.
  // O consultor perde tempo, o cliente nao perde confianca.
  if (!resposta) {
    return {
      categoria: "outro",
      precisaDoRyan: true,
      motivo: "a IA não respondeu a tempo",
      decidiuNaRegra: false,
    };
  }

  const categoria = CATEGORIAS.includes(resposta.categoria)
    ? resposta.categoria
    : "outro";

  // So um false explicito libera o bot. Qualquer outra coisa — true, null,
  // string, campo faltando — cai na fila.
  let precisaDoRyan = resposta.precisa_do_ryan !== false;

  // Cinto e suspensorio: se o proprio modelo disse "valor", nao ha discussao.
  if (categoria === "valor") precisaDoRyan = true;

  return {
    categoria,
    precisaDoRyan,
    motivo: precisaDoRyan ? "depende de um dado seu" : null,
    decidiuNaRegra: false,
  };
}
