import { lerAmbiente } from "../ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "../supabase.js";

/*
  O que existe de verdade no banco agora.

  Antes de qualquer simulação, isto: rodar um E2E contra um banco pela
  metade produz erro que parece de código e é de migration. Uma hora
  procurando bug no lugar errado.
*/

const CONFERIR = [
  ["conversas", "id, escalonamentos, so_voce", "16_handoff.sql"],
  ["rascunhos", "id, origem", "16_handoff.sql"],
  ["acoes_do_agente", "id, tipo, detalhe", "17 + 18"],
  ["motor_estado", "user_id, estado, servicos", "18_observabilidade.sql"],
  ["metricas_do_agente", "recebidas, taxa_automacao", "18_observabilidade.sql"],
  ["motivos_de_handoff", "motivo, vezes", "18_observabilidade.sql"],
  ["memoria", "id, coletado, perguntado", "14_memoria.sql"],
  ["preferencias", "modo, categorias", "15_modos.sql"],
  ["conhecimento", "assunto, conteudo", "12_conhecimento.sql"],
  ["respostas_boas", "categoria, resposta_ryan", "04_fase3.sql"],
];

const ambiente = lerAmbiente();
const supabase = criarClienteDoMotor(ambiente);
const usuario = await entrarNaConta(supabase, ambiente);

console.log(`\nconta: ${usuario.email}`);
console.log(`banco: ${ambiente.url}\n`);

const faltando = new Set();

for (const [tabela, colunas, migration] of CONFERIR) {
  const { error } = await supabase.from(tabela).select(colunas).limit(1);

  if (error) {
    console.log(`  ✗ ${tabela.padEnd(20)} ${error.message}`);
    faltando.add(migration);
  } else {
    console.log(`  ✓ ${tabela.padEnd(20)} ${colunas}`);
  }
}

console.log("");
if (faltando.size) {
  console.log(`FALTA RODAR: ${[...faltando].join(", ")}`);
  process.exit(2);
}
console.log("banco completo");
process.exit(0);
