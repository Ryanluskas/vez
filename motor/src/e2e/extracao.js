import { criarMemoria } from "../memoria.js";
import { pensar } from "../ia.js";

/*
  O E2E mostrou duas vezes seguidas que "sou aposentado do INSS" não vira
  `convenio: inss` na memória — enquanto nome e banco são aprendidos sem
  falha. Isto mede o que o modelo devolve de verdade, sem adivinhação.

  Roda direto contra o Ollama, sem banco: o que interessa aqui é a extração.
*/

const FRASES = [
  ["sou aposentado do INSS", "convenio", "inss"],
  ["sou aposentada pelo INSS", "convenio", "inss"],
  ["recebo pelo INSS", "convenio", "inss"],
  ["sou pensionista", "convenio", "inss"],
  ["sou servidor público estadual", "convenio", "servidor"],
  ["sou militar da reserva", "convenio", "militar"],
  ["meu nome é Antonio", "nome", "Antonio"],
  ["meu empréstimo hoje é no Santander", "banco", "Santander"],
  ["quero baixar minha taxa", "objetivo", "reducao_taxa"],
];

/* A memória vazia: força a extração a rodar sempre. */
const memoria = criarMemoria(null, null);
const VAZIA = { nome: null, convenio: null, banco: null, objetivo: null };

console.log("\nO que o modelo extrai de cada frase\n");

let acertos = 0;

for (const [frase, campo, esperado] of FRASES) {
  const cru = await pensar({
    sistema:
      'Você lê uma mensagem de cliente e extrai APENAS os fatos que ele afirmou explicitamente.\n\nResponda SOMENTE com JSON:\n{"nome":null,"convenio":null,"banco":null,"objetivo":null}',
    prompt: `Mensagem do cliente: "${frase}"`,
  });

  const limpo = await memoria.extrairDaMensagem(frase, VAZIA);
  const veio = limpo?.[campo] ?? null;
  const bateu = String(veio).toLowerCase() === String(esperado).toLowerCase();

  if (bateu) acertos++;

  console.log(`  ${bateu ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} "${frase}"`);
  console.log(`      esperado ${campo}=${esperado}  ·  veio ${campo}=${veio}`);
  console.log(`      \x1b[2mcru do modelo: ${JSON.stringify(cru)}\x1b[0m`);
}

console.log(`\n  ${acertos}/${FRASES.length} extraídos corretamente\n`);
