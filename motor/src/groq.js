import { log } from "./log.js";

/*
  ============================================================================
  GROQ — o modelo grande, usado só para escrever

  Por que existe: o llama3.2:3b local decide bem e escreve mal. Medido na
  simulação: misturou "R$" com "%", copiou número de exemplo, respondeu
  "Não sei" pro cliente. Enquanto era rascunho isso custava um ajuste; em
  modo autônomo vai direto pro cliente.

  O QUE NUNCA PASSA POR AQUI: valor, parcela, saldo, margem, taxa. A regra
  rígida (gatilhos.js) corta essas mensagens antes de qualquer IA, local ou
  remota. O que o Groq recebe é conversa sem número — e quando recebe um
  número, ele veio do consultor e vai junto como dado a copiar, nunca a
  inventar.

  Modelo configurável por GROQ_MODELO. A lógica do agente não conhece nome
  de modelo nenhum.
  ============================================================================
*/

const ENDERECO = "https://api.groq.com/openai/v1/chat/completions";
/*
  O padrao mudou de llama-3.3-70b-versatile porque o Groq tirou aquele
  modelo do ar no meio de uma sessao — funcionava as 05:15 e devolvia 404
  as 06:07. Catalogo de terceiro muda sem avisar, e por isso o modelo e
  variavel de ambiente desde o comeco.

  Medido nesta conta: 772ms pra escrever uma resposta de WhatsApp.
*/
const MODELO = process.env.GROQ_MODELO || "openai/gpt-oss-120b";
const CHAVE = process.env.GROQ_API_KEY;
/*
  Medido nesta conta: 528ms pra escrever uma saudação com o
  llama-3.3-70b-versatile. Trinta segundos de paciência era um número
  escolhido sem medir nada.

  Oito segundos são quinze vezes o tempo normal — folga de sobra pra rede
  ruim, e curto o bastante pra sobrar tempo de tentar o modelo local antes
  de o cliente desistir. Passar disso não vira resposta chutada: vira o
  local, e depois a resposta determinística, e depois a Fila.
*/
const PACIENCIA_MS = Number(process.env.GROQ_TIMEOUT_MS) || 8_000;

export const groqConfigurado = Boolean(CHAVE);
export const modeloDoGroq = MODELO;

export async function groqVivo() {
  if (!CHAVE) return false;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${CHAVE}` },
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/*
  Devolve texto, ou null. Nunca lança: quem chama decide o que fazer com o
  null, e a decisão em todo lugar deste produto é a mesma — na dúvida, o
  consultor entra.
*/
export async function gerarNoGroq({
  prompt,
  sistema,
  json = false,
  temperatura = 0.7,
}) {
  if (!CHAVE) return null;

  const inicio = Date.now();
  try {
    const r = await fetch(ENDERECO, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHAVE}`,
      },
      signal: AbortSignal.timeout(PACIENCIA_MS),
      body: JSON.stringify({
        model: MODELO,
        temperature: temperatura,
        max_tokens: json ? 400 : 500,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          ...(sistema ? [{ role: "system", content: sistema }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      // 429 = cota. Vale distinguir: o consultor precisa saber se e limite.
      log.erro(
        r.status === 429
          ? "Groq recusou por limite de uso. Caindo pro modelo local."
          : `Groq respondeu ${r.status}. Caindo pro modelo local. ${corpo.slice(0, 120)}`
      );
      return null;
    }

    const dados = await r.json();
    const texto = dados?.choices?.[0]?.message?.content ?? "";
    return texto.trim() || null;
  } catch (erro) {
    const segundos = Math.round((Date.now() - inicio) / 1000);
    const motivo =
      erro.name === "TimeoutError" ? `desistiu depois de ${segundos}s` : erro.message;
    log.erro(`Groq falhou (${motivo}). Caindo pro modelo local.`);
    return null;
  }
}
