import { lerAmbiente } from "./ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "./supabase.js";
import {
  ollamaVivo,
  modeloDisponivel,
  aquecer,
  modeloEmUso,
  enderecoDoOllama,
} from "./ollama.js";
import { classificar } from "./classificar.js";
import { checarGatilhos } from "./gatilhos.js";

/*
  `npm run diagnostico` — confere tudo de que o motor depende e diz, em
  portugues, o que fazer com cada coisa que estiver errada.

  Existe porque descobrir problema por tentativa e erro custa caro: cada
  peca deste produto mora num lugar diferente (o banco na nuvem, a IA no
  processador, o WhatsApp no celular) e quando uma falha o sintoma aparece
  em outra. Aqui cada peca fala por si.
*/

const CHECK = "✓";
const CRUZ = "✗";
const ALERTA = "!";

let houveFalha = false;

function ok(texto) {
  console.log(`  ${CHECK} ${texto}`);
}

function falha(texto, comoResolver) {
  houveFalha = true;
  console.log(`  ${CRUZ} ${texto}`);
  if (comoResolver) console.log(`      → ${comoResolver}`);
}

function aviso(texto, comoResolver) {
  console.log(`  ${ALERTA} ${texto}`);
  if (comoResolver) console.log(`      → ${comoResolver}`);
}

function titulo(texto) {
  console.log(`\n${texto}`);
}

async function checarConfig() {
  titulo("Configuração");
  try {
    const a = lerAmbiente();
    ok(`motor/.env preenchido (${a.email})`);
    return a;
  } catch (erro) {
    falha(erro.message.split("\n")[0], "Copie motor/.env.example para motor/.env");
    return null;
  }
}

async function checarIa() {
  titulo("Inteligência artificial");

  if (!(await ollamaVivo())) {
    falha(
      `Ollama não responde em ${enderecoDoOllama}`,
      "Abra o aplicativo do Ollama. Sem ele, TUDO vai para a Fila."
    );
    return false;
  }
  ok(`Ollama de pé em ${enderecoDoOllama}`);

  if (!(await modeloDisponivel())) {
    falha(`Modelo ${modeloEmUso} não foi baixado`, `Rode: ollama pull ${modeloEmUso}`);
    return false;
  }
  ok(`Modelo ${modeloEmUso} pronto`);

  const segundos = await aquecer();
  if (segundos === null) {
    aviso("não consegui carregar o modelo na memória", "a máquina pode estar sem RAM livre");
  } else if (segundos > 25) {
    aviso(
      `carregar o modelo levou ${segundos}s — esta máquina é lenta para 3B`,
      `considere um modelo menor: OLLAMA_MODELO=llama3.2:1b`
    );
  } else {
    ok(`Modelo carregado na memória em ${segundos}s`);
  }

  return true;
}

async function checarBanco(ambiente) {
  titulo("Banco e conta");

  const supabase = criarClienteDoMotor(ambiente);

  let usuario;
  try {
    usuario = await entrarNaConta(supabase, ambiente);
    ok(`Login funcionando (${usuario.email})`);
  } catch (erro) {
    falha(erro.message, null);
    return null;
  }

  const tabelas = [
    "conversas",
    "mensagens",
    "pendencias",
    "rascunhos",
    "respostas_boas",
    "conexoes",
  ];

  for (const t of tabelas) {
    const { error } = await supabase.from(t).select("id").limit(1);
    if (error) {
      falha(`tabela "${t}" não responde: ${error.message}`, "Rode banco/tudo.sql no SQL Editor");
      return null;
    }
  }
  ok(`As 6 tabelas respondem`);

  // Colunas das Fases 3-5 moram no 04_fase3.sql.
  const { error: erroFase3 } = await supabase
    .from("rascunhos")
    .select("categoria, id_pendencia, enviado_em")
    .limit(1);

  if (erroFase3) {
    falha("faltam as colunas das Fases 3-5", "Rode banco/04_fase3.sql (ou tudo.sql de novo)");
    return null;
  }
  ok("Colunas das Fases 3-5 no lugar");

  return supabase;
}

/* A parte que mais importa: a regra de ouro ainda está de pé? */
async function checarRegraDeOuro(temIa) {
  titulo("Regra de ouro — dinheiro nunca passa pela IA");

  const perguntasDeDinheiro = [
    "quanto eu consigo pegar?",
    "a parcela fica em quanto?",
    "da pra pegar quanto",
    "qual meu saldo",
  ];

  let todasTravaram = true;
  for (const p of perguntasDeDinheiro) {
    const { travou, motivo } = checarGatilhos(p);
    if (!travou) {
      falha(`DEIXOU PASSAR: "${p}"`, "Isso é grave. Rode: npm test --prefix motor");
      todasTravaram = false;
    } else {
      ok(`"${p}" → fila (${motivo})`);
    }
  }

  if (!todasTravaram || !temIa) return;

  titulo("Teste real do classificador");
  const amostras = [
    { texto: "bom dia, tudo bem?", esperado: false },
    { texto: "quais documentos eu preciso levar?", esperado: false },
    { texto: "quanto libera pra mim?", esperado: true },
  ];

  for (const { texto, esperado } of amostras) {
    const inicio = Date.now();
    const r = await classificar({ texto, contexto: null });
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    const destino = r.precisaDoRyan ? "FILA" : "bot responde";
    const certo = r.precisaDoRyan === esperado;

    const linha = `"${texto}" → ${destino} · ${r.categoria} · ${seg}s${
      r.decidiuNaRegra ? " (regra rígida)" : ""
    }`;

    if (certo) ok(linha);
    else aviso(linha, `esperava ${esperado ? "FILA" : "bot responde"} — o modelo pode variar`);
  }
}

async function principal() {
  console.log("\nvez · diagnóstico\n" + "─".repeat(40));

  const ambiente = await checarConfig();
  const temIa = await checarIa();
  if (ambiente) await checarBanco(ambiente);
  await checarRegraDeOuro(temIa);

  console.log("\n" + "─".repeat(40));
  if (houveFalha) {
    console.log("Tem coisa pra resolver acima. Cada linha com ✗ diz o que fazer.\n");
    process.exit(1);
  }
  console.log("Tudo pronto. Rode: npm start --prefix motor\n");
  process.exit(0);
}

principal().catch((erro) => {
  console.error(`\n${CRUZ} diagnóstico quebrou: ${erro.message}\n`);
  process.exit(1);
});
