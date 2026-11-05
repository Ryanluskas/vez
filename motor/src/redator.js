import { escrever } from "./ia.js";
import { checarGatilhos } from "./gatilhos.js";
import { mascarar, conferir, sobrouMarcador } from "./numeros.js";
import { semRotulosDeRequisito } from "./requisitos.js";
import { oQueSumiuDaResposta, afirmouSerTudoSemBase } from "./agente/validar.js";
import { DIRETRIZES_DE_PERSUASAO } from "./comercial/playbook.js";
import { log } from "./log.js";

/*
  Escreve rascunhos imitando o jeito do consultor.

  Nao existe treinamento nem fine-tuning aqui: a maquina do consultor nao
  aguentaria e nao precisa. O que existe e few-shot — a gente cola 2 ou 3
  respostas que ELE ja aprovou, da mesma categoria, e pede pro modelo seguir
  o tom. Quanto mais ele aprova, mais parecido fica, de graca.
*/

const REGRA_DE_OURO = `REGRAS QUE NÃO SE QUEBRAM:
- Nunca invente número. Nem valor, nem parcela, nem prazo, nem taxa, nem data.
- Nunca explique como funciona taxa, prazo, portabilidade, refinanciamento ou
  política de banco, a não ser que a explicação esteja escrita acima. Você não sabe.
- Se faltar qualquer informação para responder, escreva apenas: NAO_SEI
  Nunca escreva "não sei" para o cliente. Quem não sabe vai verificar e volta.
- NUNCA diga que VOCÊ fez a simulação, o cálculo ou a conta. Quem faz é o
  sistema do banco. Se o número já existe, ele foi conferido — diga "consegui",
  nunca "calculei" nem "simulei aqui".
- Não use emoji a não ser que os exemplos usem.
- Escreva só a mensagem, nada além dela.`;

/*
  ============================================================================
  COMO O RYAN ESCREVE

  O bot já lembrava do contexto e ainda soava como chatbot. A diferença não
  estava no que ele sabia — estava no tamanho e no tom do que escrevia.

  Consultor no WhatsApp escreve uma linha. "Sim, consigo conferir isso pra
  você." Ponto. Não abre parágrafo pra confirmar recebimento, não anuncia o
  que vai fazer antes de fazer, não agradece a informação antes de usá-la.

  Duas frases é o teto. Uma é o normal.
  ============================================================================
*/
const COMO_ELE_ESCREVE = `ESTILO DE ESCRITA (HUMANIZAÇÃO EXTREMA):
- Jamais use listas, tópicos ou negrito em conversas normais (EXCEÇÃO: no envio do checklist oficial de fechamento dos 5 documentos).
- Escreva como alguém no WhatsApp: frases curtas, sem letras maiúsculas excessivas, sem "prezado" ou "estou à disposição".
- Se o cliente for informal, seja informal. 
- Use gírias leves de vendas como "na lata", "direto ao ponto", "sem enrolação", "dinheiro no bolso".
- Nunca responda com parágrafos longos. Quebre a resposta em duas mensagens curtas se for necessário.
- Uma ou duas frases. Se dá pra responder em cinco palavras, responda em cinco palavras.
- Nunca abra a mensagem confirmando que recebeu: já está respondendo.
- Proibido usar: "Como posso ajudar?", "Sinta-se à vontade", "Estarei aguardando", "Prezado", "Para que eu possa auxiliá-lo".
- Proibido parecer educado demais. Seja profissional, mas seja um VENDEDOR.
- A conversa JÁ COMEÇOU. Não se apresente de novo, não repita que viu o contrato dele.
- Pergunte no máximo UMA coisa por mensagem na triagem. Interrogatório afasta.
- Se o cliente já disse algo, use — não confirme que ele disse.
- No fechamento da proposta com aceite, apresente o checklist completo com os 5 documentos exigidos (documento oficial com foto, comprovante de endereço, contracheque/holerite, extrato de margem e contratos Santander) com a alternativa ilusória ao final.

Assim é bom:
  "Sim, consigo conferir isso pra você."
  "Vou verificar esse valor e já te falo."
  "Me manda só o extrato de margem."
  "Perfeito, Santander. Vamos seguir."
  "Isso, é daquela mesma."`;

export function limparFormatacaoWhatsApp(texto) {
  if (!texto || typeof texto !== "string") return "";
  let limpo = texto;
  // Remove negrito (**texto** ou *texto*)
  limpo = limpo.replace(/\*\*([^*]+)\*\*/g, "$1");
  limpo = limpo.replace(/\*([^*\n]+)\*/g, "$1");
  // Remove itálico (__texto__ ou _texto_)
  limpo = limpo.replace(/__([^_]+)__/g, "$1");
  limpo = limpo.replace(/_([^_\n]+)_/g, "$1");
  // Remove marcadores de lista (* item, - item, • item, 1. item)
  limpo = limpo.replace(/^[\s]*[-*•]\s+/gm, "");
  limpo = limpo.replace(/^[\s]*\d+\.\s+/gm, "");
  // Colapsa quebras de linha excessivas
  limpo = limpo.replace(/\n{3,}/g, "\n\n");
  return limpo.trim();
}

/*
  Os exemplos entram MASCARADOS: "R$ ___" no lugar do valor.

  Na simulação o modelo copiou os números do exemplo e ofereceu ao cliente
  um valor que era de outra pessoa. Exemplo serve pra ensinar tom e formato;
  número vem só do que o consultor conferiu.
*/
function montarExemplos(exemplos) {
  if (!exemplos?.length) return "";
  const blocos = exemplos
    .map((e) => `Cliente: ${e.mensagem_cliente}\nVocê: ${mascarar(e.resposta_ryan)}`)
    .join("\n\n");
  return (
    `\nVeja como você respondeu casos parecidos antes. Copie o TOM e o TAMANHO, nunca o conteúdo.\n` +
    `VALOR, PRAZO, PARCELA e TAXA são espaços a preencher. Nunca escreva essas palavras na sua resposta:\n\n${blocos}\n`
  );
}

/*
  Ultima barreira antes do rascunho existir. Mesmo com todas as instrucoes,
  um modelo de 3B pode alucinar um "R$ 5.000". Se o texto gerado tocar em
  dinheiro, o rascunho e descartado e a conversa vai pra fila.
*/
/* O manual entra antes de tudo: o modelo lê o contexto e depois a tarefa. */
function montarManual(manual) {
  if (!manual?.trim()) return "";
  return (
    `\nO QUE VOCÊ SABE SOBRE A SUA OPERAÇÃO — use como verdade, ` +
    `e não afirme nada que não esteja aqui:\n\n${manual.trim()}\n`
  );
}

function seguro(texto, { permitirNumeros = false, manual = "" } = {}) {
  if (!texto) return false;

  /*
    O modelo escreve a desistencia de varios jeitos: NAO_SEI, "não sei",
    "nao sei dizer". Na primeira simulacao ele mandou "Não sei" direto pro
    cliente porque meu filtro so pegava a versao com underline. Um consultor
    nunca responde "não sei" — ele verifica e volta.
  */
  if (/n[aã]o[\s_]*sei/i.test(texto)) return false;
  if (texto.trim().length < 12) return false;

  // Marcador do exemplo que vazou pro texto final. Cliente nao pode receber
  // "consegui liberar VALOR pra voce".
  if (sobrouMarcador(texto)) return false;

  if (permitirNumeros) return true;

  const { travou, motivo } = checarGatilhos(texto);
  if (!travou) return true;

  /*
    Travou so por causa de um numero, e todo numero do texto veio do manual
    que o consultor escreveu? Entao e fato da empresa, nao valor de cliente.
    E o caso do CNPJ: sem esta excecao o bot nunca conseguiria responder
    "isso nao e golpe?", que e das objecoes mais comuns do ramo.
  */
  if (motivo === "citou um numero grande" && manual) {
    if (conferir(texto, manual).length === 0) return true;
  }

  /*
    ================================================================
    NOME DE DOCUMENTO NÃO É VALOR

    "Extrato de margem" tem a palavra "margem". O bot pede esse papel numa
    mensagem, e a partir daí a frase fica no CONTEXTO da conversa — que é
    o que ele lê pra responder a próxima.

    Foi assim que o cliente perguntou "quanto tempo demora pra cair?" e
    recebeu "vou verificar": a resposta certa mencionava o extrato de
    margem que o próprio bot tinha pedido, e o guarda a descartava. Duas
    tentativas seguidas, mesma recusa — não era sorte do modelo, era o
    contexto.

    A prova aqui é comparativa: troca os nomes de documento por
    "documento" e roda o gatilho de novo. Parou de disparar? Então o que
    travou era o nome do papel. Continua disparando? É dinheiro de
    verdade, e não passa.

    O que isto NÃO libera: "sua margem está liberada" não contém o rótulo
    "extrato de margem", então a troca não muda nada e continua barrado.
    E o número, se houver, já foi conferido acima.
    ================================================================
  */
  if (!checarGatilhos(semRotulosDeRequisito(texto)).travou) {
    // Sem número inventado, é o bot falando do papel que ele mesmo pediu.
    if (conferir(texto, manual).length === 0) return true;
  }

  /*
    Persuasão Comercial CapitalCred autorizada:
    Expressões como "1,40%", "2,x%", "120 meses", "taxa", "parcela", "lucro"
    são termos fixos da proposta de refinanciamento do Santander. Não são
    valores inventados do cliente, são as regras do produto.
  */
  const textoSemTermosComerciais = texto
    .replace(/\b1,40%?\b/g, "")
    .replace(/\b2,[xX]%?\b/g, "")
    .replace(/\b120\s+meses\b/g, "")
    .replace(/\b(?:taxa|parcelas?|juros|troco|reduzir|redu[cç][aã]o|lucro|refinanciamento|refin)\b/gi, "");

  if (!checarGatilhos(semRotulosDeRequisito(textoSemTermosComerciais)).travou) {
    if (conferir(textoSemTermosComerciais, manual).length === 0) return true;
  }

  /*
    Mostra o texto barrado. Sem isso, "descartei porque falou de valor" é
    impossível de investigar — passei três rodadas de teste adivinhando qual
    palavra tinha disparado o gatilho.

    Vai só pro terminal, que é a máquina do consultor e já mostra as
    mensagens dos clientes na íntegra. NÃO vai pro diário: aquele é gravado
    no banco, e é justamente onde valor não pode entrar.
  */
  log.alerta(
    `Rascunho descartado: a IA escreveu sobre valor (${motivo}).\n   texto: ${texto.replace(/\n/g, " ").slice(0, 160)}`
  );
  return false;
}

/*
  Caso 3 — falta informação do CLIENTE, não do consultor.

  O QUE pedir vem de requisitos.js, em código: o modelo não escolhe o
  documento, ele só embrulha o pedido no tom certo. Se o modelo falhar,
  quem chamou manda o pedido cru — que já é uma frase inteira e correta.

  Nenhum número entra aqui, então esta é a única saída do redator que pode
  responder a uma pergunta de dinheiro sem furar a regra de ouro: ela não
  responde a pergunta, ela pede o que falta pra poder responder.
*/
export async function escreverPedido({
  pedido,
  mensagemCliente,
  nomeCliente,
  contexto,
  exemplos,
  manual = "",
  memoria = "",
}) {
  /*
    "Me manda o extrato de margem" contém a palavra "margem", que é gatilho
    de dinheiro. Qualquer texto que o modelo escrevesse em cima disso seria
    descartado pelo guarda logo abaixo — e o que sairia é o pedido cru, que
    já está aqui.

    Medido no teste de ponta a ponta: 90 segundos de geração indo direto
    pro lixo, toda vez que o bot precisa pedir a margem.

    Afrouxar o guarda pra deixar esse caso passar foi tentado e descartado:
    o mesmo afrouxamento deixaria passar "sua margem hoje é de R$ 800".
    Não dá pra distinguir pelo motivo do gatilho. Então a saída é não gastar
    a chamada — a mensagem que o cliente recebe é exatamente a mesma.
  */
  if (checarGatilhos(pedido).travou) {
    if (/documento|comprovante|contracheque/i.test(pedido)) {
      return pedido;
    }
    log.info("O pedido já fala de margem/saldo; mando o texto do requisito direto.");
    return null;
  }

  const textoCru = await escrever({
    sistema:
      `Você é o próprio consultor de crédito consignado no WhatsApp. Escreva na primeira pessoa.\n` +
      montarManual(manual) +
      (memoria ? `\n${memoria}\n` : "") +
      `\n${DIRETRIZES_DE_PERSUASAO}\n\n` +
      `O cliente perguntou algo que você só consegue responder depois de receber uma informação dele.\n` +
      `Diga que consegue conferir e peça a informação. Em uma frase, sem rodeio.\n` +
      `NÃO prometa valor, não diga que "vai dar certo", não estime nada.\n\n` +
      `${COMO_ELE_ESCREVE}\n\n${REGRA_DE_OURO}`,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      (contexto ? `Conversa até agora:\n${contexto}\n\n` : "") +
      `O cliente${nomeCliente ? ` (${nomeCliente})` : ""} disse: "${mensagemCliente}"\n\n` +
      `O QUE VOCÊ PRECISA PEDIR: "${pedido}"\n\n` +
      `Se o pedido for a lista de fechamento/documentos, preserve integralmente o checklist dos documentos exigidos (documento com foto, comprovante de endereço, contracheque, extrato de margem e contratos Santander) e finalize com a Alternativa Ilusória (perguntando se prefere mandar a foto agora ou se prefere que te chame daqui a pouco para tirar com calma).\n\n` +
      `Escreva a mensagem de WhatsApp.`,
    temperatura: 0.7,
  });

  const texto = limparFormatacaoWhatsApp(textoCru);
  return seguro(texto) ? texto : null;
}

/*
  Caso 1 — pergunta simples, que o bot da conta sozinho.
  Devolve o texto do rascunho, ou null se ele nao souber responder sem chutar.
*/
export async function escreverResposta({
  mensagemCliente,
  nomeCliente,
  contexto,
  exemplos,
  manual = "",
  memoria = "",
  consultas = "",
}) {
  /*
    `consultas` é o que as ferramentas trouxeram para ESTA mensagem — o
    trecho do manual que fala do assunto, o que ainda falta do cliente, o
    aviso de que a simulação não está disponível.

    Vem separado do manual porque é específico da pergunta: o manual é o
    que sempre vale, isto é o que importa agora. O modelo pequeno presta
    mais atenção no que está mais perto da tarefa.
  */
  const sistema =
    `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n` +
    montarManual(manual) +
    (consultas ? `\nSOBRE ESTA PERGUNTA, especificamente:\n${consultas.trim()}\n` : "") +
    (memoria ? `\n${memoria}\nNunca pergunte de novo algo que já está aí.\n` : "") +
    `\n${DIRETRIZES_DE_PERSUASAO}\n\n${COMO_ELE_ESCREVE}\n\n${REGRA_DE_OURO}`;

  const prompt =
    `${montarExemplos(exemplos)}\n` +
    (contexto ? `Conversa até agora:\n${contexto}\n\n` : "") +
    `Agora responda esta mensagem${nomeCliente ? ` de ${nomeCliente}` : ""}: "${mensagemCliente}"`;

  /*
    O que as consultas trouxeram conta como fonte permitida de número pelo
    mesmo motivo que o manual conta: saiu da tabela `conhecimento`, que
    quem escreveu foi o consultor. Nada aqui vem do modelo.
  */
  const fontes = { manual: `${manual}\n${consultas}` };

  const primeiraCru = await escrever({ sistema, prompt, temperatura: 0.7 });
  const primeira = limparFormatacaoWhatsApp(primeiraCru);
  if (seguro(primeira, fontes)) return primeira;

  /*
    ================================================================
    UMA SEGUNDA CHANCE, E SÓ UMA

    O guarda recusou. Na maioria das vezes não é porque a resposta
    estava errada — é porque o modelo escolheu uma palavra de dinheiro
    que estava no manual. Medido: perguntando "quanto tempo demora pra
    cair", dez tentativas passaram e a décima primeira mencionou margem.
    É variação de temperatura, não erro de raciocínio.

    Perguntar de novo custa ~500ms no Groq e converte um handoff em
    resposta. O que NÃO muda é o guarda: a segunda tentativa passa
    exatamente pelo mesmo crivo, e se ela também tocar em dinheiro, o
    caso é do consultor.

    Duas e pronto. Insistir até passar seria rolar o dado até dar o
    número que eu quero — e aí o guarda vira decoração.
  */
  if (primeiraCru === null) return null;

  const segundaCru = await escrever({
    sistema:
      `${sistema}\n\nIMPORTANTE: a resposta anterior foi recusada por tocar em ` +
      `valor, parcela, saldo ou margem. Responda de novo SEM citar nenhuma dessas coisas.`,
    prompt,
    temperatura: 0.2,
  });

  const segunda = limparFormatacaoWhatsApp(segundaCru);
  if (seguro(segunda, fontes)) {
    log.info("Segunda tentativa passou no guarda.");
    return segunda;
  }

  return null;
}

/*
  Caso 2 — o consultor respondeu a pendencia no painel e agora o bot embrulha
  a resposta dele numa mensagem no tom dele.

  Aqui numero PODE aparecer, mas so o que ele escreveu. Por isso o prompt
  repete o dado cru e manda copiar exatamente.
*/
export async function escreverComResposta({
  mensagemCliente,
  respostaDoConsultor,
  nomeCliente,
  exemplos,
  manual = "",
  memoria = "",
}) {
  const textoCru = await escrever({
    sistema:
      `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n` +
      montarManual(manual) +
      (memoria ? `\n${memoria}\n` : "") +
      `\n${DIRETRIZES_DE_PERSUASAO}\n\n` +
      `O DADO abaixo foi conferido pelo consultor no sistema do banco. Copie os números dele EXATAMENTE como estão escritos. Não arredonde, não recalcule, não acrescente nenhum número novo, não converta formato.\n\n` +
      `NÃO ENCURTE O DADO. Se ele cita quatro documentos, sua mensagem cita os quatro. Não escolha um "pra começar", não deixe nenhum "pra depois", não resuma. Aqui a regra de pedir uma coisa por vez NÃO vale: quem decidiu o que pedir foi o consultor, e ele já decidiu.\n\n` +
      `NUNCA afirme que aquilo é tudo — nada de "só isso", "mais nada", "é só". Você não sabe o que o banco exige; quem sabe é o consultor, e ele só disse o que está no DADO.\n\n` +
      `Seu trabalho não é repetir o dado: é entregar a notícia como gente. Chame o cliente pelo nome, entregue com ancoragem e honestidade sobre o prazo (troca de dívida cara por barata sem aumentar parcela), e termine oferecendo o próximo passo.\n\n` +
      `${COMO_ELE_ESCREVE}\n\n${REGRA_DE_OURO}`,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      `O cliente${nomeCliente ? ` (${nomeCliente})` : ""} perguntou: "${mensagemCliente}"\n\n` +
      `DADO CONFERIDO PELO CONSULTOR: "${respostaDoConsultor}"\n\n` +
      `Escreva agora a mensagem de WhatsApp para ${nomeCliente ?? "o cliente"}. ` +
      `Siga a Jornada de Persuasão: ao entregar valores, ancore a taxa e ressignifique o prazo de 120 meses como a ferramenta necessária para liberar o valor sem subir a parcela ("troca de dívida cara por uma mais barata e ainda embolsar a diferença"). ` +
      `Onde os exemplos têm VALOR, PRAZO, PARCELA ou TAXA, escreva o número correspondente do DADO. ` +
      `Não use nenhum número que não esteja no DADO.`,
    temperatura: 0.7,
  });

  const texto = limparFormatacaoWhatsApp(textoCru);

  /*
    ==================================================================
    A IA NÃO PODE ENCURTAR NEM COMPLETAR A SUA RESPOSTA

    O consultor digitou "preciso de: documento com foto, comprovante de
    endereço, contracheque atualizado e agência/conta" e o que saiu foi
    "Me manda uma foto do seu documento pra começar." Três documentos
    sumiram. Na mensagem seguinte a IA ainda afirmou "Sim, só isso" —
    inventando um requisito que contradizia a própria resposta que
    recebeu. O cliente respondeu "tenho certeza que o banco não pede só
    isso" e parou de responder.

    A instrução acima pede pra não fazer isso. Instrução não segura
    sozinha: já existia uma mandando copiar os números exatos, e ela vale
    porque existe CONFERÊNCIA depois. Para itens de lista não existia
    nenhuma, e o modelo descartava em silêncio.

    Reprovando aqui, sai a resposta crua do consultor. Ela é feia —
    "preciso de: documento com foto, comprovante..." — e é completa e
    verdadeira. Entre bonita e errada e feia e certa, foi a bonita e
    errada que fez o cliente desistir.
    ==================================================================
  */
  const sumiu = oQueSumiuDaResposta(texto, respostaDoConsultor);
  const inventouQueETudo = afirmouSerTudoSemBase(texto, respostaDoConsultor);

  // Se a IA falhar aqui, o proprio texto do consultor vira o rascunho.
  // Ele escreveu, ele confere na tela de Rascunhos, ninguem fica esperando.
  if (!seguro(texto, { permitirNumeros: true }) || sumiu.length || inventouQueETudo) {
    const porque = sumiu.length
      ? `a IA descartou o que você pediu: ${sumiu.join(", ")}`
      : inventouQueETudo
        ? 'a IA afirmou "só isso" e você não disse isso'
        : !texto
          ? "a IA não respondeu"
          : /n[aã]o[\s_]*sei/i.test(texto)
            ? "a IA disse que não sabe"
            : "a IA escreveu curto demais";
    log.alerta(`Rascunho pela sua resposta crua (${porque}).`);
    return respostaDoConsultor;
  }

  /*
    Conferencia de procedencia: TODO numero do rascunho tem que estar na
    resposta do consultor ou na pergunta do cliente. Foi assim que a
    simulacao pegou o modelo transformando "parcela de 210" em
    "210x de R$ 29,90" — inventando o 29,90 no meio do caminho.
  */
  // O manual entra como fonte permitida: CNPJ e afins sao fatos da empresa,
  // nao numeros inventados no meio da conversa.
  const inventados = conferir(texto, respostaDoConsultor, mensagemCliente, manual);
  if (inventados.length) {
    log.alerta(
      `Rascunho recusado: a IA inventou ${inventados.join(", ")}. Usando a sua resposta como está.`
    );
    return respostaDoConsultor;
  }

  return texto;
}
