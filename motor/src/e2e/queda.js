import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

/*
  Cenários 17 e 18: a IA cai, e depois volta.

  Num processo separado, de propósito. O endereço do Ollama é lido quando o
  módulo carrega; trocar a variável de ambiente depois não muda nada. Só
  outro processo consegue apontar pra uma porta morta e medir o que
  acontece de verdade.

  A pergunta é uma só: com a IA fora do ar, o agente inventa alguma coisa?
*/

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const roteiro = path.join(AQUI, "_queda_temp.mjs");

const iaJs = pathParaUrl(path.join(AQUI, "..", "ia.js"));
const resilienciaJs = pathParaUrl(path.join(AQUI, "..", "resiliencia.js"));

/* O caminho vira URL de arquivo: sem isso, espaço em "Nova pasta" quebra o
   import e o erro sai como se o módulo não existisse. */
function pathParaUrl(p) {
  return new URL(`file:///${p.replace(/\\/g, "/")}`).href;
}

fs.writeFileSync(
  roteiro,
  `
import { pensar, escrever } from ${JSON.stringify(iaJs)};
import { disjuntores } from ${JSON.stringify(resilienciaJs)};

const pensou = await pensar({ sistema: "responda json", prompt: "oi" });
const escreveu = await escrever({ sistema: "escreva uma saudacao", prompt: "oi" });

for (let i = 0; i < 5; i++) await pensar({ sistema: "x", prompt: "y" });

console.log("RESULTADO " + JSON.stringify({
  pensou,
  escreveu,
  estado: disjuntores.ollama.estado,
  aberto: disjuntores.ollama.aberto,
}));
`
);

const casos = [
  ["Ollama fora do ar", { OLLAMA_URL: "http://127.0.0.1:9", GROQ_API_KEY: "" }],
  ["Ollama e Groq fora", { OLLAMA_URL: "http://127.0.0.1:9", GROQ_API_KEY: "gsk_chave_invalida_de_teste" }],
];

let falhas = 0;

function conferir(nome, ok, detalhe = "") {
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${nome}${detalhe ? `  \x1b[2m${detalhe}\x1b[0m` : ""}`);
  if (!ok) falhas++;
}

try {
  for (const [nome, env] of casos) {
    console.log(`\n\x1b[1m── ${nome} ${"─".repeat(Math.max(0, 45 - nome.length))}\x1b[0m`);

    let saida = "";
    try {
      saida = execFileSync(process.execPath, [roteiro], {
        env: { ...process.env, ...env },
        encoding: "utf8",
        timeout: 180_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (erro) {
      saida = `${erro.stdout ?? ""}`;
      if (!saida.includes("RESULTADO")) {
        conferir("processo rodou", false, erro.message.slice(0, 100));
        continue;
      }
    }

    const linha = saida.split("\n").find((l) => l.startsWith("RESULTADO"));
    const r = JSON.parse(linha.replace("RESULTADO ", ""));

    conferir("pensar() devolve nada", r.pensou === null, `veio: ${JSON.stringify(r.pensou)}`);
    conferir("escrever() devolve nada", r.escreveu === null, `veio: ${JSON.stringify(r.escreveu)}`);
    conferir(
      "nenhum texto de consolo",
      !r.pensou && !r.escreveu,
      "null aqui vira pendência lá em cima, nunca resposta chutada"
    );
    conferir("o disjuntor abriu", r.aberto === true, `estado: ${r.estado}`);
  }

  /* Recuperação: o mesmo código, com o endereço certo, volta a funcionar. */
  console.log(`\n\x1b[1m── Recuperação ${"─".repeat(34)}\x1b[0m`);

  const saidaBoa = execFileSync(process.execPath, [roteiro], {
    env: { ...process.env, GROQ_API_KEY: "" },
    encoding: "utf8",
    timeout: 300_000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const boa = JSON.parse(saidaBoa.split("\n").find((l) => l.startsWith("RESULTADO")).replace("RESULTADO ", ""));

  conferir("com o Ollama de volta, pensar() responde", boa.pensou !== null, JSON.stringify(boa.pensou)?.slice(0, 60));
  conferir("o disjuntor não ficou preso aberto", boa.aberto === false, `estado: ${boa.estado}`);
} finally {
  fs.rmSync(roteiro, { force: true });
}

console.log(`\n  ${falhas === 0 ? "\x1b[32mtudo passou\x1b[0m" : `\x1b[31m${falhas} falha(s)\x1b[0m`}\n`);
process.exit(falhas ? 1 : 0);
