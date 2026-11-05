import { criarTravas } from "../src/travas.js";
import { calcularReducaoCapitalCred } from "../src/comercial/calculadora.js";
import {
  gerarHashAprovacao,
  validarIntegridadeAprovacao,
} from "../src/dossie/aprovacao.js";

function calcularEstatisticas(latenciasMs) {
  latenciasMs.sort((a, b) => a - b);
  const total = latenciasMs.length;
  const soma = latenciasMs.reduce((acc, v) => acc + v, 0);
  const media = soma / total;
  const p50 = latenciasMs[Math.floor(total * 0.5)];
  const p95 = latenciasMs[Math.floor(total * 0.95)];
  const p99 = latenciasMs[Math.floor(total * 0.99)];
  const min = latenciasMs[0];
  const max = latenciasMs[total - 1];

  return { media, p50, p95, p99, min, max, total };
}

async function benchmarkFilaMemoria(iteracoes = 500) {
  const travas = criarTravas();
  const latencias = [];
  const inicio = performance.now();
  const memInicial = process.memoryUsage().heapUsed;

  const promessas = [];
  for (let i = 0; i < iteracoes; i++) {
    const idConversa = `cliente_${i % 25}`; // 25 clientes simultâneos
    promessas.push(
      travas.naVezDe(idConversa, async () => {
        const t0 = performance.now();
        // I/O simulado de 1 a 3ms
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3) + 1));
        latencias.push(performance.now() - t0);
      })
    );
  }

  await Promise.all(promessas);
  const duracaoTotal = performance.now() - inicio;
  const memFinal = process.memoryUsage().heapUsed;
  const stats = calcularEstatisticas(latencias);

  return {
    componente: "Fila em Memória (travas.js com 25 filas simultâneas)",
    iteracoes,
    duracaoTotalMs: duracaoTotal.toFixed(2),
    throughputOpsSec: Math.round((iteracoes / (duracaoTotal / 1000))),
    latenciaMediaMs: stats.media.toFixed(3),
    latenciaP95Ms: stats.p95.toFixed(3),
    latenciaP99Ms: stats.p99.toFixed(3),
    memoriaDeltaKb: Math.round((memFinal - memInicial) / 1024),
    locksRestantes: travas.ocupadas(),
  };
}

function benchmarkHMAC(iteracoes = 1000) {
  const latencias = [];
  const inicio = performance.now();
  const memInicial = process.memoryUsage().heapUsed;

  const ts = new Date().toISOString();
  for (let i = 0; i < iteracoes; i++) {
    const t0 = performance.now();
    const hash = gerarHashAprovacao({
      idOperacao: `op_${i}`,
      codigoOperacao: `VEZ-2026-${i}`,
      idOrganizacao: "tenant_benchmark",
      versao: 1,
      textoPagamento: "TEXTO PADRONIZADO SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA O BENCHMARK DE DESEMPENHO.",
      userId: "operador_bench",
      timestamp: ts,
    });
    validarIntegridadeAprovacao({
      idOperacao: `op_${i}`,
      codigoOperacao: `VEZ-2026-${i}`,
      idOrganizacao: "tenant_benchmark",
      versao: 1,
      textoPagamento: "TEXTO PADRONIZADO SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA O BENCHMARK DE DESEMPENHO.",
      userId: "operador_bench",
      timestamp: ts,
      hashEsperado: hash,
    });
    latencias.push(performance.now() - t0);
  }

  const duracaoTotal = performance.now() - inicio;
  const memFinal = process.memoryUsage().heapUsed;
  const stats = calcularEstatisticas(latencias);

  return {
    componente: "Criptografia HMAC-SHA256 (gerar + validar integridade)",
    iteracoes,
    duracaoTotalMs: duracaoTotal.toFixed(2),
    throughputOpsSec: Math.round((iteracoes / (duracaoTotal / 1000))),
    latenciaMediaMs: stats.media.toFixed(4),
    latenciaP95Ms: stats.p95.toFixed(4),
    latenciaP99Ms: stats.p99.toFixed(4),
    memoriaDeltaKb: Math.round((memFinal - memInicial) / 1024),
  };
}

function benchmarkCalculadoraFinanceira(iteracoes = 2000) {
  const latencias = [];
  const inicio = performance.now();
  const memInicial = process.memoryUsage().heapUsed;

  const valores = ["R$ 7.600,00", "8.000,00", "7999.99", "10000", "R$ 15.420,50"];
  for (let i = 0; i < iteracoes; i++) {
    const t0 = performance.now();
    calcularReducaoCapitalCred(valores[i % valores.length]);
    latencias.push(performance.now() - t0);
  }

  const duracaoTotal = performance.now() - inicio;
  const memFinal = process.memoryUsage().heapUsed;
  const stats = calcularEstatisticas(latencias);

  return {
    componente: "Calculadora Financeira Canônica (parsing + split 50/50 e 62/38 + formatação)",
    iteracoes,
    duracaoTotalMs: duracaoTotal.toFixed(2),
    throughputOpsSec: Math.round((iteracoes / (duracaoTotal / 1000))),
    latenciaMediaMs: stats.media.toFixed(5),
    latenciaP95Ms: stats.p95.toFixed(5),
    latenciaP99Ms: stats.p99.toFixed(5),
    memoriaDeltaKb: Math.round((memFinal - memInicial) / 1024),
  };
}

async function rodarBenchmarks() {
  console.log("=== INICIANDO BENCHMARK REALISTA DE SUBSISTEMAS DO VEZ ===");
  const bFila = await benchmarkFilaMemoria(500);
  const bHmac = benchmarkHMAC(1000);
  const bCalc = benchmarkCalculadoraFinanceira(2000);

  console.log(JSON.stringify([bFila, bHmac, bCalc], null, 2));
}

rodarBenchmarks();
