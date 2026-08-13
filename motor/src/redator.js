import { gerar } from "./ollama.js";
import { checarGatilhos } from "./gatilhos.js";
import { mascarar, conferir, sobrouMarcador } from "./numeros.js";
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

  log.alerta(`Rascunho descartado: a IA escreveu sobre valor (${motivo}).`);
  return false;
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
}) {
  const texto = await gerar({
    sistema:
      `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n` +
      montarManual(manual) +
      `\n${REGRA_DE_OURO}`,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      (contexto ? `Conversa até agora:\n${contexto}\n\n` : "") +
      `Agora responda esta mensagem${nomeCliente ? ` de ${nomeCliente}` : ""}: "${mensagemCliente}"`,
    temperatura: 0.4,
  });

  return seguro(texto, { manual }) ? texto : null;
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
}) {
  const texto = await gerar({
    sistema:
      `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n` +
      montarManual(manual) +
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
