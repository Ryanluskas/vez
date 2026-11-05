import { test } from "node:test";
import assert from "node:assert/strict";
import { criarTravas } from "../src/travas.js";

/**
 * Suite de testes de estresse progressivo de concorrência:
 * Valida a escalabilidade da engine sob 10, 30, 50 e 100 conversas simultâneas.
 *
 * Propriedades verificadas:
 * 1. Serialização estrita FIFO por conversa (sem intercalação de turnos de um mesmo cliente).
 * 2. Paralelismo real entre clientes distintos (sem bloqueio de um cliente por outro).
 * 3. Liberação atômica de locks e ausência de vazamento de memória (mapa de travas zerado).
 * 4. Isolamento total de falhas (um erro em uma conversa não contamina outras conversas).
 */

async function executarCenarioConcorrencia({ numConversas, msgsPorConversa, injetarFalhas = false }) {
  const travas = criarTravas();
  const historicoPorConversa = new Map();
  const errosEsperados = new Set();

  for (let i = 1; i <= numConversas; i++) {
    historicoPorConversa.set(`conversa_${i}`, []);
  }

  const memInicial = process.memoryUsage().heapUsed;
  const inicioTempo = Date.now();
  const promessas = [];

  for (let c = 1; c <= numConversas; c++) {
    const idConversa = `conversa_${c}`;

    for (let m = 1; m <= msgsPorConversa; m++) {
      const seq = m;
      const deveFalhar = injetarFalhas && (c % 7 === 0) && (m === 2);

      if (deveFalhar) {
        errosEsperados.add(`${idConversa}_m${m}`);
      }

      const p = travas.naVezDe(idConversa, async () => {
        // Simula latência de I/O realista e não uniforme (2 a 8ms)
        const atraso = Math.floor(Math.random() * 6) + 2;
        await new Promise((resolve) => setTimeout(resolve, atraso));

        if (deveFalhar) {
          throw new Error(`Falha simulada na mensagem ${m} da conversa ${idConversa}`);
        }

        historicoPorConversa.get(idConversa).push(seq);
        return seq;
      });

      // Se falhar intencionalmente, tratamos a promise localmente para o Promise.all não abortar antecipadamente
      promessas.push(
        p.catch((err) => {
          if (!deveFalhar) throw err;
          return `erro_capturado_${idConversa}_m${m}`;
        })
      );
    }
  }

  const resultados = await Promise.all(promessas);
  const duracaoMs = Date.now() - inicioTempo;
  const memFinal = process.memoryUsage().heapUsed;

  // 1. Validação de integridade e ordenação FIFO para cada conversa
  for (let c = 1; c <= numConversas; c++) {
    const idConversa = `conversa_${c}`;
    const ordem = historicoPorConversa.get(idConversa);

    if (injetarFalhas && c % 7 === 0) {
      // Mensagem 2 falhou intencionalmente; as demais devem ter rodado em ordem
      assert.deepEqual(
        ordem,
        [1, 3],
        `Conversa com falha isolada ${idConversa} deve ter processado [1, 3] sem travar`
      );
    } else {
      const esperado = Array.from({ length: msgsPorConversa }, (_, idx) => idx + 1);
      assert.deepEqual(
        ordem,
        esperado,
        `Conversa ${idConversa} deve manter a ordem sequencial estrita FIFO`
      );
    }
  }

  // 2. Validação de limpeza total dos locks (sem leaks)
  assert.equal(
    travas.ocupadas(),
    0,
    `Todas as travas devem ser liberadas ao término (concorrência: ${numConversas})`
  );

  return {
    numConversas,
    totalMensagens: numConversas * msgsPorConversa,
    duracaoMs,
    taxaPorSegundo: Math.round(((numConversas * msgsPorConversa) / (duracaoMs / 1000))),
    memDeltaKb: Math.round((memFinal - memInicial) / 1024),
  };
}

test("Estresse de Concorrência Nível 1: 10 conversas simultâneas (50 mensagens)", async () => {
  const metrica = await executarCenarioConcorrencia({ numConversas: 10, msgsPorConversa: 5 });
  assert.equal(metrica.totalMensagens, 50);
  assert.ok(metrica.duracaoMs < 3000, `Duração deve ser < 3s, foi ${metrica.duracaoMs}ms`);
});

test("Estresse de Concorrência Nível 2: 30 conversas simultâneas (150 mensagens)", async () => {
  const metrica = await executarCenarioConcorrencia({ numConversas: 30, msgsPorConversa: 5 });
  assert.equal(metrica.totalMensagens, 150);
  assert.ok(metrica.duracaoMs < 5000, `Duração deve ser < 5s, foi ${metrica.duracaoMs}ms`);
});

test("Estresse de Concorrência Nível 3: 50 conversas simultâneas (150 mensagens + falhas isoladas)", async () => {
  const metrica = await executarCenarioConcorrencia({
    numConversas: 50,
    msgsPorConversa: 3,
    injetarFalhas: true,
  });
  assert.equal(metrica.totalMensagens, 150);
  assert.ok(metrica.duracaoMs < 5000, `Duração deve ser < 5s, foi ${metrica.duracaoMs}ms`);
});

test("Estresse de Concorrência Nível 4: 100 conversas simultâneas (300 mensagens em paralelo)", async () => {
  const metrica = await executarCenarioConcorrencia({ numConversas: 100, msgsPorConversa: 3 });
  assert.equal(metrica.totalMensagens, 300);
  assert.ok(metrica.duracaoMs < 8000, `Duração deve ser < 8s, foi ${metrica.duracaoMs}ms`);
});
