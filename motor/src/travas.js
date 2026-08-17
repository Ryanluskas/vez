/*
  ============================================================================
  UMA CONVERSA POR VEZ, TODAS AO MESMO TEMPO

  As duas coisas são o mesmo requisito visto de dois ângulos:

    Cliente ansioso manda "oi", "tudo bem?", "quanto libera?" em três
    segundos. São três eventos do WhatsApp quase simultâneos. Sem trava,
    o motor classifica os três em paralelo, decide três vezes, e o cliente
    recebe três mensagens — ou pior, duas pendências e uma resposta.

    Ao mesmo tempo, o cliente A esperando você responder NÃO pode fazer o
    cliente B esperar. Uma fila global resolveria o primeiro problema e
    criaria o segundo.

  Por isso a trava é POR CONVERSA. Cada conversa vira uma fila de um; as
  conversas entre si não se enxergam.

  Isto vale dentro deste processo. O que impede dois MOTORES de brigarem é
  outra coisa — `instancia.js`, uma trava de arquivo. E o que impede o
  mesmo evento do WhatsApp de ser tratado duas vezes é o índice único em
  `mensagens.id_whatsapp`. Três defesas, três problemas diferentes.
  ============================================================================
*/

export function criarTravas() {
  /* id da conversa -> promessa da última tarefa enfileirada nela. */
  const filas = new Map();

  /*
    Enfileira `tarefa` na conversa e devolve o resultado dela.

    O encadeamento é o truque: cada nova tarefa espera a anterior TERMINAR,
    dê certo ou dê errado. Uma tarefa que estoura não pode travar a fila da
    conversa pra sempre — por isso o catch antes do encadeamento.
  */
  async function naVezDe(idConversa, tarefa) {
    if (!idConversa) return tarefa();

    const anterior = filas.get(idConversa) ?? Promise.resolve();

    let liberar;
    const minhaVez = new Promise((r) => (liberar = r));
    const minhaEntrada = anterior.then(() => minhaVez);
    filas.set(idConversa, minhaEntrada);

    await anterior.catch(() => {});

    try {
      return await tarefa();
    } finally {
      liberar();
      /*
        Sou a última da fila? Então some com a entrada. Sem isso o Map
        cresce uma entrada por conversa e nunca encolhe — num consultor
        com 3 mil clientes isso é vazamento de memória com data marcada.
      */
      if (filas.get(idConversa) === minhaEntrada) filas.delete(idConversa);
    }
  }

  return {
    naVezDe,
    /* Quantas conversas têm trabalho na fila agora. Pro log e pros testes. */
    ocupadas: () => filas.size,
  };
}

/*
  Guarda de eventos já vistos.

  O WhatsApp reentrega evento: reconexão, aba recarregada, sincronia do
  celular. O índice único em `mensagens.id_whatsapp` pega isso no banco,
  mas só DEPOIS de uma ida ao Supabase. Este conjunto pega antes, de graça,
  e vale para eventos que nem chegam a virar mensagem.

  Tamanho limitado de propósito: é uma janela do que acabou de acontecer,
  não um histórico. Reentrega acontece em segundos, não em dias.
*/
export function criarMemoriaDeEventos(tamanho = 500) {
  const vistos = new Set();
  const ordem = [];

  return {
    /* true = é a primeira vez que vejo este id. */
    novo(id) {
      if (!id) return true;
      if (vistos.has(id)) return false;

      vistos.add(id);
      ordem.push(id);

      if (ordem.length > tamanho) {
        vistos.delete(ordem.shift());
      }
      return true;
    },

    tamanho: () => vistos.size,
  };
}
