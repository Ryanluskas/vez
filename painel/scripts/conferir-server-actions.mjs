import fs from "node:fs";
import path from "node:path";

/*
  ============================================================================
  UM ARQUIVO "use server" SÓ PODE EXPORTAR FUNÇÃO ASYNC

  A regra é do React, e existe por um motivo: todo export daquele arquivo
  vira um endpoint que o navegador pode chamar. Exportar um array ali não é
  um endpoint — é o loader do Next tropeçando:

    A "use server" file can only export async functions, found object.

  O DETALHE QUE FAZ ISSO VALER UM SCRIPT

  `next build` compila sem reclamar. O erro só aparece quando a página é
  renderizada de verdade, e só pra quem está logado. Foi exatamente assim
  que dois arrays exportados de `acoes-painel.ts` passaram por um build
  limpo e derrubaram o /meu-jeito em produção.

  Build verde não prova página no ar. Este script prova a parte que o build
  não olha, e roda em milissegundos.
  ============================================================================
*/

const RAIZ = path.resolve(import.meta.dirname, "..");
const PASTAS = ["lib", "app", "components"];

/* Tipo é apagado na compilação: `export type` nunca vira endpoint. */
const EXPORT_DE_TIPO = /^export\s+(?:type|interface)\b/;
const EXPORT_ASYNC = /^export\s+async\s+function\s+\w+/;
const EXPORT_QUALQUER = /^export\s+(?!async\s+function)(.+)$/;

function arquivosDe(pasta) {
  const achados = [];
  const fila = [path.join(RAIZ, pasta)];

  while (fila.length) {
    const atual = fila.pop();
    if (!fs.existsSync(atual)) continue;

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);
      if (item.isDirectory()) {
        if (item.name !== "node_modules" && !item.name.startsWith(".")) fila.push(completo);
      } else if (/\.(ts|tsx|js|jsx)$/.test(item.name)) {
        achados.push(completo);
      }
    }
  }

  return achados;
}

const problemas = [];
let conferidos = 0;

for (const pasta of PASTAS) {
  for (const arquivo of arquivosDe(pasta)) {
    const conteudo = fs.readFileSync(arquivo, "utf8");

    // "use server" tem que ser a primeira instrução do arquivo pra valer.
    if (!/^\s*["']use server["']/.test(conteudo)) continue;
    conferidos++;

    const linhas = conteudo.split("\n");
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      if (!linha.startsWith("export")) continue;
      if (EXPORT_DE_TIPO.test(linha)) continue;
      if (EXPORT_ASYNC.test(linha)) continue;
      if (!EXPORT_QUALQUER.test(linha)) continue;

      problemas.push({
        arquivo: path.relative(RAIZ, arquivo),
        linha: i + 1,
        trecho: linha.slice(0, 80),
      });
    }
  }
}

if (problemas.length === 0) {
  console.log(`✓ ${conferidos} arquivo(s) "use server" — só funções async exportadas`);
  process.exit(0);
}

console.log(`✗ ${problemas.length} export(s) que vão derrubar a página em runtime:\n`);
for (const p of problemas) {
  console.log(`  ${p.arquivo}:${p.linha}`);
  console.log(`    ${p.trecho}`);
}
console.log(`\n  Mova para um módulo sem "use server" e importe de lá.`);
process.exit(1);
