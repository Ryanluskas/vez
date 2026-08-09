import { gerar } from "./ollama.js";
import { checarGatilhos } from "./gatilhos.js";
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
- Se a resposta exigir um número que não está escrito acima, responda apenas: NAO_SEI
- Escreva como mensagem de WhatsApp: curta, sem formalidade de e-mail, sem assinatura.
- Não use emoji a não ser que os exemplos usem.
- Não repita a pergunta do cliente.
- Escreva só a mensagem, nada além dela.`;

function montarExemplos(exemplos) {
  if (!exemplos?.length) return "";
  const blocos = exemplos
    .map((e) => `Cliente: ${e.mensagem_cliente}\nVocê: ${e.resposta_ryan}`)
    .join("\n\n");
  return `\nVeja como você respondeu casos parecidos antes. Use o mesmo tom, o mesmo tamanho e o mesmo jeito de falar:\n\n${blocos}\n`;
}

/*
  Ultima barreira antes do rascunho existir. Mesmo com todas as instrucoes,
  um modelo de 3B pode alucinar um "R$ 5.000". Se o texto gerado tocar em
  dinheiro, o rascunho e descartado e a conversa vai pra fila.
*/
function seguro(texto, { permitirNumeros = false } = {}) {
  if (!texto) return false;
  if (/nao_sei|não_sei/i.test(texto)) return false;
  if (permitirNumeros) return true;

  const { travou, motivo } = checarGatilhos(texto);
  if (travou) {
    log.alerta(`Rascunho descartado: a IA escreveu sobre valor (${motivo}).`);
    return false;
  }
  return true;
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
}) {
  const texto = await gerar({
    sistema: `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa, como ele escreveria.\n\n${REGRA_DE_OURO}`,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      (contexto ? `Conversa até agora:\n${contexto}\n\n` : "") +
      `Agora responda esta mensagem${nomeCliente ? ` de ${nomeCliente}` : ""}: "${mensagemCliente}"`,
    temperatura: 0.4,
  });

  return seguro(texto) ? texto : null;
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
}) {
  const texto = await gerar({
    sistema: `Você é o próprio consultor de crédito consignado respondendo seu cliente no WhatsApp. Escreva na primeira pessoa.\n\nO dado abaixo foi conferido pelo consultor. Copie os números dele EXATAMENTE como estão. Não arredonde, não recalcule, não acrescente nenhum número novo.\n\n${REGRA_DE_OURO}`,
    prompt:
      `${montarExemplos(exemplos)}\n` +
      `O cliente${nomeCliente ? ` (${nomeCliente})` : ""} perguntou: "${mensagemCliente}"\n\n` +
      `O consultor conferiu e respondeu isto: "${respostaDoConsultor}"\n\n` +
      `Escreva a mensagem de WhatsApp que leva essa resposta ao cliente.`,
    temperatura: 0.4,
  });

  // Se a IA falhar aqui, o proprio texto do consultor vira o rascunho.
  // Ele escreveu, ele confere na tela de Rascunhos, ninguem fica esperando.
  if (!seguro(texto, { permitirNumeros: true })) {
    log.alerta("A IA não redigiu: usando a sua resposta como está.");
    return respostaDoConsultor;
  }

  return texto;
}
