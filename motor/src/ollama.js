import { log } from "./log.js";

const ENDERECO = process.env.OLLAMA_URL || "http://localhost:11434";
const MODELO = process.env.OLLAMA_MODELO || "llama3.2:3b";

/*
  A maquina alvo tem 8GB de RAM e roda no processador, sem placa de video.
  Um minuto e muito, mas e melhor esperar do que desistir no meio e mandar
  pra fila uma coisa que o bot daria conta.
*/
const PACIENCIA_MS = 90_000;

/*
  Mantem o modelo na RAM entre uma mensagem e outra.

  Sem isso, o Ollama descarrega o modelo depois de 5 minutos parado e a
  proxima mensagem paga 40s so pra recarregar 2GB do disco — foi exatamente
  o que estourou o timeout no primeiro diagnostico. Consultor recebe mensagem
  em rajada e depois fica uma hora sem nada; 30 minutos cobrem o vai e vem
  de um atendimento inteiro.
*/
const MANTER_NA_RAM = "30m";

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

/*
  ============================================================================
  UMA GERACAO DE CADA VEZ

  O Ollama roda no processador e atende uma requisicao por vez. Cliente
  manda tres mensagens seguidas — coisa comum — e o motor disparava tres
  classificacoes juntas: a primeira rodava, a segunda e a terceira ficavam
  esperando na fila do Ollama e estouravam o tempo limite SEM NUNCA TEREM
  COMECADO. No log aparecia "demorou demais" tres vezes, e tudo caia na
  fila do consultor.

  A fila abaixo garante que o relogio de cada chamada so comeca quando ela
  realmente comeca. Espera-se na fila, nao se perde nela.
  ============================================================================
*/
let ultimaDaFila = Promise.resolve();

function naFila(tarefa) {
  const minhaVez = ultimaDaFila.then(tarefa, tarefa);
  // A fila nao pode morrer por causa de uma tarefa que falhou.
  ultimaDaFila = minhaVez.catch(() => {});
  return minhaVez;
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
export async function gerar(opcoes) {
  // Entra na fila. O relogio de 90s so comeca quando chegar a vez dela.
  return naFila(() => gerarAgora(opcoes));
}

async function gerarAgora({ prompt, sistema, json = false, temperatura = 0.3 }) {
  const inicio = Date.now();
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
        keep_alive: MANTER_NA_RAM,
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
    const segundos = Math.round((Date.now() - inicio) / 1000);
    const motivo =
      erro.name === "TimeoutError"
        ? `desistiu depois de ${segundos}s`
        : erro.message;
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

/*
  Carrega o modelo na RAM antes do primeiro cliente aparecer.

  O motor liga, gasta 40s aquecendo enquanto ninguem esta esperando, e a
  primeira mensagem de verdade ja pega o modelo quente. Sem isso, quem paga
  a espera do carregamento e o primeiro cliente do dia.
*/
export async function aquecer() {
  const inicio = Date.now();
  try {
    await fetch(`${ENDERECO}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(PACIENCIA_MS),
      body: JSON.stringify({
        model: MODELO,
        prompt: "oi",
        stream: false,
        keep_alive: MANTER_NA_RAM,
        options: { num_predict: 1 },
      }),
    });
    return Math.round((Date.now() - inicio) / 1000);
  } catch {
    return null;
  }
}

export const modeloEmUso = MODELO;
export const enderecoDoOllama = ENDERECO;
