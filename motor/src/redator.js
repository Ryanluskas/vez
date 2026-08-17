import { escrever } from "./ia.js";
import { checarGatilhos } from "./gatilhos.js";
import { mascarar, conferir, sobrouMarcador } from "./numeros.js";
import { semRotulosDeRequisito } from "./requisitos.js";
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
- Escreva como mensagem de WhatsApp: curta, sem formalidade de e-mail, sem assinatura.
- Não use emoji a não ser que os exemplos usem.
- Não repita a pergunta do cliente de volta.
- Termine com uma pergunta curta que dê ao cliente o próximo passo.
- Escreva só a mensagem, nada além dela.`;

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
    log.info("O pedido já fala de margem/saldo; mando o texto do requisito direto.");
    return null;
  }

  const texto = await escrever({
    sistema:
      `Você é o próprio consultor de crédito consignado no WhatsApp. Escreva na primeira pessoa.\n` +
      montarManual(manual) +
      (memoria ? `\n${memoria}\n` : "") +
      `\nO cliente perguntou algo que você só consegue responder depois de receber uma informação dele.\n` +
      `Sua mensagem deve: reconhecer o que ele pediu, explicar em meia linha que você precisa disso para conseguir a resposta, e pedir.\n` +
      `NÃO prometa valor, não diga que "vai dar certo", não estime nada.\n\n` +
      REGRA_DE_OURO,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      (contexto ? `Conversa até agora:\n${contexto}\n\n` : "") +
      `O cliente${nomeCliente ? ` (${nomeCliente})` : ""} disse: "${mensagemCliente}"\n\n` +
      `O QUE VOCÊ PRECISA PEDIR, exatamente isto e nada além: "${pedido}"\n\n` +
      `Escreva a mensagem de WhatsApp.`,
    temperatura: 0.4,
  });

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
    `\n${REGRA_DE_OURO}`;

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

  const primeira = await escrever({ sistema, prompt, temperatura: 0.4 });
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
  if (primeira === null) return null;

  const segunda = await escrever({
    sistema:
      `${sistema}\n\nIMPORTANTE: a resposta anterior foi recusada por tocar em ` +
      `valor, parcela, saldo ou margem. Responda de novo SEM citar nenhuma dessas coisas.`,
    prompt,
    temperatura: 0.2,
  });

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
  const texto = await escrever({
    sistema:
      `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n` +
      montarManual(manual) +
      (memoria ? `\n${memoria}\n` : "") +
      `\nO DADO abaixo foi conferido pelo consultor no sistema do banco. Copie os números dele EXATAMENTE como estão escritos. Não arredonde, não recalcule, não acrescente nenhum número novo, não converta formato.\n\n` +
      `Seu trabalho não é repetir o dado: é entregar a notícia como gente. Chame o cliente pelo nome, diga o que conseguiu, e termine oferecendo o próximo passo.\n\n` +
      REGRA_DE_OURO,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      `O cliente${nomeCliente ? ` (${nomeCliente})` : ""} perguntou: "${mensagemCliente}"\n\n` +
      `DADO CONFERIDO PELO CONSULTOR: "${respostaDoConsultor}"\n\n` +
      `Escreva agora a mensagem de WhatsApp para ${nomeCliente ?? "o cliente"}. ` +
      `Onde os exemplos têm VALOR, PRAZO, PARCELA ou TAXA, escreva o número correspondente do DADO. ` +
      `Não use nenhum número que não esteja no DADO.`,
    temperatura: 0.4,
  });

  // Se a IA falhar aqui, o proprio texto do consultor vira o rascunho.
  // Ele escreveu, ele confere na tela de Rascunhos, ninguem fica esperando.
  if (!seguro(texto, { permitirNumeros: true })) {
    const porque = !texto
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
