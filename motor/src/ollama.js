import { log } from "./log.js";

const ENDERECO = process.env.OLLAMA_URL || "http://localhost:11434";
const MODELO = process.env.OLLAMA_MODELO || "llama3.2:3b";

/*
  A maquina alvo tem 8GB de RAM e roda no processador, sem placa de video.
  Um minuto e muito, mas e melhor esperar do que desistir no meio e mandar
  pra fila uma coisa que o bot daria conta.
*/
const PACIENCIA_MS = 60_000;

/* O Ollama esta de pe? Usado no boot e antes de cada classificacao. */
export async function ollamaVivo() {
  try {
    const r = await fetch(`${ENDERECO}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/* Confere se o modelo foi baixado. Erro cedo e melhor que erro no cliente. */
export async function modeloDisponivel() {
  try {
    const r = await fetch(`${ENDERECO}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return false;
    const { models = [] } = await r.json();
    // "llama3.2:3b" e "llama3.2:3b-instruct-q4" contam como o mesmo modelo.
    const base = MODELO.split(":")[0];
    return models.some((m) => (m.name ?? "").startsWith(base));
  } catch {
    return false;
  }
}

/*
  Uma geracao. Devolve texto, ou null se algo deu errado.
  NUNCA lanca excecao: quem chama decide o que fazer com o null, e a decisao
  em todo lugar deste produto e a mesma — na duvida, manda pra fila.
*/
export async function gerar({ prompt, sistema, json = false, temperatura = 0.3 }) {
  try {
    const r = await fetch(`${ENDERECO}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(PACIENCIA_MS),
      body: JSON.stringify({
        model: MODELO,
        prompt,
        system: sistema,
        stream: false,
        ...(json ? { format: "json" } : {}),
        options: {
          temperature: temperatura,
          num_predict: json ? 120 : 300,
        },
      }),
    });

    if (!r.ok) {
      log.erro(`Ollama respondeu ${r.status}. Mandando pra fila.`);
      return null;
    }

    const dados = await r.json();
    return (dados.response ?? "").trim() || null;
  } catch (erro) {
    const motivo = erro.name === "TimeoutError" ? "demorou demais" : erro.message;
    log.erro(`Ollama falhou (${motivo}). Mandando pra fila.`);
    return null;
  }
}

/* Geracao que devolve objeto. Null se o modelo cuspir algo que nao e JSON. */
export async function gerarJson({ prompt, sistema }) {
  const bruto = await gerar({ prompt, sistema, json: true, temperatura: 0 });
  if (!bruto) return null;

  try {
    return JSON.parse(bruto);
  } catch {
    // Modelo pequeno as vezes embrulha o JSON em texto. Tenta achar o objeto.
    const recorte = bruto.match(/\{[\s\S]*\}/);
    if (!recorte) {
      log.erro("Ollama devolveu algo que nao e JSON. Mandando pra fila.");
      return null;
    }
    try {
      return JSON.parse(recorte[0]);
    } catch {
      log.erro("Ollama devolveu JSON quebrado. Mandando pra fila.");
      return null;
    }
  }
}

export const modeloEmUso = MODELO;
export const enderecoDoOllama = ENDERECO;
