import { PERSONAS, acharPersona } from "./personas.js";
import { gerar, ollamaVivo, modeloDisponivel, aquecer, modeloEmUso } from "../ollama.js";
import { checarGatilhos } from "../gatilhos.js";
import { classificar } from "../classificar.js";
import { escreverResposta, escreverComResposta } from "../redator.js";
import { exemplosComBase } from "../estilo.js";
// Mesmo detector que roda em producao: se ele mudar, o teste muda junto.
import { numerosDeRisco } from "../numeros.js";

/*
  ============================================================================
  SIMULADOR DE ATENDIMENTO

  Dois agentes conversando: um cliente difícil de um lado, o bot do outro, e
  o pipeline DE VERDADE no meio (gatilhos → classificar → redator). Não é uma
  maquete: é o mesmo código que atende no WhatsApp.

  O que o simulador procura, em ordem de gravidade:

  1. VAZAMENTO — o bot escreveu um número que o consultor não deu. É o único
     erro que não tem desculpa, porque é exatamente a promessa do produto.
  2. Conversa morta — o bot respondeu sem fazer pergunta nenhuma e o cliente
     não tem por onde continuar.
  3. Fila à toa — mandou pro consultor coisa que ele mesmo daria conta.

  Rodar:  npm run simular            (todas as personas)
          npm run simular marlene    (uma só)
          npm run simular marlene 8  (uma só, 8 rodadas)
  ============================================================================
*/

const TURNOS_PADRAO = 6;

/* ---------------------------------------------------------------------------
   O agente cliente
--------------------------------------------------------------------------- */

async function falaDoCliente(persona, historico) {
  const conversa = historico
    .map((h) => `${h.quem === "cliente" ? "Você" : "Consultor"}: ${h.texto}`)
    .join("\n");

  const texto = await gerar({
    sistema: `${persona.jeito}

Você está no WhatsApp falando com um consultor de crédito consignado.
Responda com UMA mensagem curta, do jeito que você escreveria no celular.
Não escreva "Você:" nem explicações. Só a mensagem.`,
    prompt: conversa
      ? `${conversa}\n\nEscreva sua próxima mensagem:`
      : "Você recebeu uma mensagem de um consultor oferecendo redução de taxa. Escreva sua primeira resposta:",
    temperatura: 0.9,
  });

  return (texto ?? "não entendi").split("\n")[0].trim().slice(0, 200);
}

/* ---------------------------------------------------------------------------
   O bot — pipeline real
--------------------------------------------------------------------------- */

async function respostaDoBot({ mensagem, historico, persona, proximoDado }) {
  const contexto = historico
    .slice(-4)
    .map((h) => `${h.quem === "cliente" ? "Cliente" : "Você"}: ${h.texto}`)
    .join("\n");

  const { categoria, precisaDoRyan, motivo, decidiuNaRegra } = await classificar({
    texto: mensagem,
    contexto,
  });

  const exemplos = exemplosComBase(null, categoria);

  // Caminho 1: foi pra fila. O consultor responde e o bot redige.
  if (precisaDoRyan) {
    const dadoDoRyan = persona.dados[proximoDado % persona.dados.length];
    const texto = await escreverComResposta({
      mensagemCliente: mensagem,
      respostaDoConsultor: dadoDoRyan,
      nomeCliente: persona.nome,
      exemplos,
    });
    return { texto, viaFila: true, categoria, motivo, decidiuNaRegra, dadoDoRyan };
  }

  // Caminho 2: o bot responde sozinho. Aqui número nenhum é permitido.
  const texto = await escreverResposta({
    mensagemCliente: mensagem,
    nomeCliente: persona.nome,
    contexto,
    exemplos,
  });

  if (!texto) {
    // O redator se recusou a escrever sem chutar — isso é o produto acertando.
    const dadoDoRyan = persona.dados[proximoDado % persona.dados.length];
    const comDado = await escreverComResposta({
      mensagemCliente: mensagem,
      respostaDoConsultor: dadoDoRyan,
      nomeCliente: persona.nome,
      exemplos,
    });
    return {
      texto: comDado,
      viaFila: true,
      categoria,
      motivo: "o bot não soube responder sem chutar",
      decidiuNaRegra: false,
      dadoDoRyan,
    };
  }

  return { texto, viaFila: false, categoria, motivo: null, decidiuNaRegra, dadoDoRyan: null };
}

/* ---------------------------------------------------------------------------
   Uma conversa inteira
--------------------------------------------------------------------------- */

async function conversar(persona, turnos) {
  const historico = [];
  const problemas = [];
  const numerosLiberados = new Set();
  let dadosUsados = 0;
  let idasAFila = 0;

  console.log(`\n${"═".repeat(58)}`);
  console.log(`  ${persona.nome} — ${persona.resumo}`);
  console.log("═".repeat(58));

  for (let rodada = 1; rodada <= turnos; rodada++) {
    const mensagem = await falaDoCliente(persona, historico);
    historico.push({ quem: "cliente", texto: mensagem });
    numerosDeRisco(mensagem).forEach((n) => numerosLiberados.add(n));
    console.log(`\n  ${persona.nome}: ${mensagem}`);

    const gatilho = checarGatilhos(mensagem);
    const r = await respostaDoBot({
      mensagem,
      historico,
      persona,
      proximoDado: dadosUsados,
    });

    if (r.viaFila) {
      dadosUsados++;
      idasAFila++;
      numerosDeRisco(r.dadoDoRyan).forEach((n) => numerosLiberados.add(n));
      console.log(
        `  [fila] ${r.motivo}${gatilho.travou ? " · regra rígida" : ""} → você respondeu: "${r.dadoDoRyan}"`
      );
    }

    const texto = r.texto ?? "(o bot não respondeu)";
    historico.push({ quem: "ryan", texto });
    console.log(`  Ryan: ${texto}`);

    /* ---- avaliação ---- */

    const inventados = numerosDeRisco(texto).filter((n) => !numerosLiberados.has(n));
    if (inventados.length) {
      problemas.push({
        grave: true,
        rodada,
        o_que: `VAZOU número que você não deu: ${inventados.join(", ")}`,
        texto,
      });
      console.log(`  ⛔ VAZAMENTO: ${inventados.join(", ")}`);
    } else {
      numerosDeRisco(texto).forEach((n) => numerosLiberados.add(n));
    }

    if (!/[?]/.test(texto) && rodada < turnos) {
      problemas.push({
        grave: false,
        rodada,
        o_que: "respondeu sem perguntar nada — a conversa morre aqui",
        texto,
      });
    }
  }

  return { problemas, idasAFila, turnos };
}

/* ---------------------------------------------------------------------------
   Principal
--------------------------------------------------------------------------- */

async function principal() {
  const [alvo, turnosArg] = process.argv.slice(2);
  const turnos = Number(turnosArg) || TURNOS_PADRAO;
  const lista = alvo ? [acharPersona(alvo)] : PERSONAS;

  console.log("\nvez · simulação de atendimento");
  console.log(`modelo: ${modeloEmUso} · ${turnos} rodadas por cliente`);

  if (!(await ollamaVivo()) || !(await modeloDisponivel())) {
    console.error("\n✗ Ollama não está pronto. Rode: npm run diagnostico\n");
    process.exit(1);
  }
  await aquecer();

  const inicio = Date.now();
  const resultados = [];

  for (const persona of lista) {
    resultados.push({ persona, ...(await conversar(persona, turnos)) });
  }

  /* ---- placar ---- */

  console.log(`\n${"═".repeat(58)}`);
  console.log("  PLACAR");
  console.log("═".repeat(58));

  let vazamentos = 0;
  let mornos = 0;

  for (const r of resultados) {
    const graves = r.problemas.filter((p) => p.grave);
    const leves = r.problemas.filter((p) => !p.grave);
    vazamentos += graves.length;
    mornos += leves.length;

    console.log(
      `\n  ${r.persona.nome.padEnd(10)} ${graves.length ? "⛔" : "✓"} ` +
        `${graves.length} vazamento(s) · ${leves.length} resposta(s) sem pergunta · ` +
        `${r.idasAFila}/${r.turnos} foram pra fila`
    );

    for (const p of graves) console.log(`      rodada ${p.rodada}: ${p.o_que}`);
    for (const p of leves) console.log(`      rodada ${p.rodada}: ${p.o_que}`);
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log(`\n${"─".repeat(58)}`);
  console.log(`  ${vazamentos} vazamento(s), ${mornos} conversa(s) morta(s) · ${minutos} min`);
  console.log(
    vazamentos === 0
      ? "  A regra de ouro aguentou.\n"
      : "  A REGRA DE OURO FALHOU. Isso tem que ir pra zero antes de vender.\n"
  );

  process.exit(vazamentos > 0 ? 1 : 0);
}

principal().catch((e) => {
  console.error(`\nsimulação quebrou: ${e.message}\n`);
  process.exit(1);
});
