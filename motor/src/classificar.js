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
