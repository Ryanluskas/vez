import fs from "node:fs";
import { lerAmbiente } from "../ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "../supabase.js";
import { criarFluxo } from "../fluxo.js";
import { normalizarTelefone } from "../lista.js";
import { numerosDeRisco, conferir as conferirNumeros } from "../numeros.js";

/*
  ============================================================================
  A LISTA, COM A PLANILHA DE VERDADE

  Importa a planilha real do consultor no banco real, pergunta ao motor real
  o que ele falaria de um cliente real, e confere a conta.

  A pergunta que este arquivo responde: quando o consultor põe 66%, o número
  que chega ao cliente é 66% — e o valor cheio não sobrevive em lugar nenhum
  do caminho.

  Recebe o caminho de um JSON com as linhas da planilha:
    node src/e2e/lista.js caminho/para/lista.json
  ============================================================================
*/

const arquivo = process.argv[2];
if (!arquivo || !fs.existsSync(arquivo)) {
  console.log("Uso: node src/e2e/lista.js <arquivo.json com as linhas da planilha>");
  process.exit(1);
}

const resultados = [];

function conferir(nome, ok, detalhe = "") {
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${nome}${detalhe ? `  \x1b[2m${detalhe}\x1b[0m` : ""}`);
  resultados.push({ nome, ok: !!ok, detalhe });
}

function titulo(t) {
  console.log(`\n\x1b[1m── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}\x1b[0m`);
}

const linhas = JSON.parse(fs.readFileSync(arquivo, "utf8"));

const ambiente = lerAmbiente();
const supabase = criarClienteDoMotor(ambiente);
const usuario = await entrarNaConta(supabase, ambiente);
const userId = usuario.id;

const fluxo = criarFluxo(supabase, userId);

let idLista = null;
let prefsOriginais = null;
const conversasDeTeste = [];

async function limpar() {
  titulo("Limpeza");

  for (const id of conversasDeTeste) {
    await supabase.from("conversas").delete().eq("id", id);
  }
  console.log(`  ✓ ${conversasDeTeste.length} conversa(s) de teste removida(s)`);

  if (idLista) {
    await supabase.from("listas").delete().eq("id", idLista);
    console.log("  ✓ lista de teste removida");
  }

  if (prefsOriginais) {
    await supabase
      .from("preferencias")
      .update({
        campos_da_lista: prefsOriginais.campos_da_lista ?? [],
        porcentagem_reducao: prefsOriginais.porcentagem_reducao ?? 100,
      })
      .eq("user_id", userId);
    console.log("  ✓ campos e porcentagem devolvidos ao que estavam");
  }
}

try {
  console.log("\n\x1b[1mvez · lista de clientes\x1b[0m");
  console.log("─".repeat(60));
  console.log(`conta:    ${usuario.email}`);
  console.log(`planilha: ${linhas.length} linhas`);

  /* ---------------- importação ---------------- */

  titulo("Importando a planilha de verdade");

  const { data: prefs } = await supabase
    .from("preferencias")
    .select("campos_da_lista, porcentagem_reducao")
    .eq("user_id", userId)
    .maybeSingle();
  prefsOriginais = prefs ?? { campos_da_lista: [], porcentagem_reducao: 100 };

  const { data: lista, error: erroLista } = await supabase
    .from("listas")
    .insert({ user_id: userId, nome: "E2E — não use", arquivo: "teste.xlsx", linhas: 0 })
    .select("id")
    .single();

  if (erroLista) throw new Error(`criar lista: ${erroLista.message}`);
  idLista = lista.id;

  const prontas = [];
  let semTelefone = 0;

  for (const linha of linhas) {
    const { telefone, curto } = normalizarTelefone(linha.DDD, linha.Celular ?? linha.Telefone);
    if (!telefone) {
      semTelefone++;
      continue;
    }
    prontas.push({
      user_id: userId,
      id_lista: idLista,
      nome: linha.Nome ?? null,
      cpf: linha.CPF ? String(linha.CPF) : null,
      telefone,
      telefone_curto: curto,
      dados: linha,
    });
  }

  for (let i = 0; i < prontas.length; i += 500) {
    const { error } = await supabase.from("lista_clientes").insert(prontas.slice(i, i + 500));
    if (error) throw new Error(`inserir lote: ${error.message}`);
  }
  await supabase.from("listas").update({ linhas: prontas.length }).eq("id", idLista);

  conferir("importou a planilha", prontas.length > 0, `${prontas.length} clientes, ${semTelefone} sem telefone`);

  /* O primeiro cliente da planilha vira o cobaia. */
  const alvo = prontas[0];
  const cheio = Number(alvo.dados.Reducao_Total);
  console.log(`\n  cobaia: ${alvo.nome}`);
  console.log(`  telefone: ${alvo.telefone}`);
  console.log(`  Reducao_Total na planilha: ${cheio}`);

  /* ---------------- campo desligado ---------------- */

  titulo("Nenhum campo liberado");

  await supabase
    .from("preferencias")
    .upsert({ user_id: userId, campos_da_lista: [], porcentagem_reducao: 100 }, { onConflict: "user_id" });

  const nada = await fluxo.lista.valoresPara(alvo.telefone);
  conferir("lista existe mas o bot não fala nada", nada === null, "campo desligado = campo inexistente");

  /* ---------------- 100% ---------------- */

  titulo("Redução liberada, 100%");

  await supabase
    .from("preferencias")
    .upsert(
      { user_id: userId, campos_da_lista: ["reducao_total"], porcentagem_reducao: 100 },
      { onConflict: "user_id" }
    );

  const cem = await fluxo.lista.valoresPara(alvo.telefone);
  conferir("achou o cliente pelo telefone", !!cem, cem?.nome);
  conferir("fala o valor cheio", numerosDeRisco(cem?.valores.reducao_total ?? "").includes(String(cheio)), cem?.valores.reducao_total);
  conferir("só o campo liberado saiu", Object.keys(cem?.valores ?? {}).length === 1, Object.keys(cem?.valores ?? {}).join(", "));

  /* ---------------- 66% ---------------- */

  titulo("Redução liberada, 66%");

  await supabase
    .from("preferencias")
    .upsert(
      { user_id: userId, campos_da_lista: ["reducao_total"], porcentagem_reducao: 66 },
      { onConflict: "user_id" }
    );

  const sessentaSeis = await fluxo.lista.valoresPara(alvo.telefone);
  const esperado = Math.round(cheio * 0.66 * 100) / 100;

  conferir(
    "o cliente ouve 66%",
    numerosDeRisco(sessentaSeis?.valores.reducao_total ?? "").includes(String(esperado)),
    `${sessentaSeis?.valores.reducao_total} (esperado ${esperado})`
  );

  /*
    O ponto que mais importa: com 66% configurado, o valor CHEIO não pode
    ser aceito como número autorizado em lugar nenhum.
  */
  const fonte = sessentaSeis?.texto ?? "";
  const tentandoOCheio = conferirNumeros(`Consegui liberar R$ ${cheio} pra você!`, fonte);
  conferir(
    "o valor cheio é recusado pela conferência",
    tentandoOCheio.length > 0,
    `barrou ${tentandoOCheio.join(", ")}`
  );

  const oCerto = conferirNumeros(`Consegui liberar ${sessentaSeis.valores.reducao_total} pra você!`, fonte);
  conferir("o valor reduzido passa", oCerto.length === 0);

  /* ---------------- a ferramenta, pelo caminho real ---------------- */

  titulo("A ferramenta consultar_simulacao");

  const { data: conexoes } = await supabase.from("conexoes").select("id").limit(1);
  const conversa = await fluxo.registrar({
    idConexao: conexoes?.[0]?.id,
    idChat: `${alvo.telefone}@c.us`,
    idMensagem: `e2e_lista_${Date.now()}`,
    telefone: alvo.telefone,
    nome: null,
    texto: "quanto eu consigo?",
    direcao: "recebida",
  });
  conversasDeTeste.push(conversa.id);

  const ciclo = fluxo.executor.novoCiclo({ idConversa: conversa.id, quem: "e2e" });
  const r = await ciclo.usar("consultar_simulacao", { id_conversa: conversa.id });

  conferir("a ferramenta achou o cliente", r.ok && r.dados.disponivel === true);
  conferir("veio com a porcentagem aplicada", r.dados?.valores?.reducao_total === sessentaSeis.valores.reducao_total, r.dados?.valores?.reducao_total);
  conferir("diz de qual lista veio", !!r.dados?.de, r.dados?.de);

  /* ---------------- quem não está na lista ---------------- */

  titulo("Cliente que não está na lista");

  const forasteiro = await fluxo.registrar({
    idConexao: conexoes?.[0]?.id,
    idChat: "5511900000000@c.us",
    idMensagem: `e2e_fora_${Date.now()}`,
    telefone: "5511900000000",
    nome: null,
    texto: "quanto eu consigo?",
    direcao: "recebida",
  });
  conversasDeTeste.push(forasteiro.id);

  const ciclo2 = fluxo.executor.novoCiclo({ idConversa: forasteiro.id, quem: "e2e" });
  const fora = await ciclo2.usar("consultar_simulacao", { id_conversa: forasteiro.id });

  conferir("não tem o dado", fora.ok && fora.dados.disponivel === false);
  conferir("manda chamar o consultor", fora.dados?.proximo_passo === "solicitar_intervencao");
  conferir("não devolveu número nenhum", !/\d/.test(JSON.stringify(fora.dados ?? {})));

  /* ---------------- lista desligada ---------------- */

  titulo("Lista desligada");

  await supabase.from("listas").update({ ativa: false }).eq("id", idLista);
  const desligada = await fluxo.lista.valoresPara(alvo.telefone);
  conferir("bot para de usar a lista desligada", desligada === null);
  await supabase.from("listas").update({ ativa: true }).eq("id", idLista);
} catch (erro) {
  console.log(`\n\x1b[31m✗ PAROU: ${erro.message}\x1b[0m`);
  console.log(erro.stack?.split("\n").slice(1, 4).join("\n") ?? "");
  resultados.push({ nome: `PAROU: ${erro.message}`, ok: false });
} finally {
  await limpar();
}

titulo("Resultado");
const falhas = resultados.filter((r) => !r.ok);
console.log(`  ${resultados.length - falhas.length}/${resultados.length} passaram\n`);
for (const f of falhas) console.log(`    \x1b[31m✗\x1b[0m ${f.nome} ${f.detalhe}`);

process.exit(falhas.length ? 1 : 0);
