import { lerAmbiente } from "../ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "../supabase.js";
import { criarFluxo } from "../fluxo.js";
import { criarEscuta } from "../escuta.js";
import { montarAbordagem } from "../abordagem.js";
import { numerosDeRisco } from "../numeros.js";

/*
  ============================================================================
  A CONVERSA DO ADEMAR, RODANDO DE VERDADE

  Os testes unitários provam que o estado e as referências funcionam. Este
  aqui prova que a CONVERSA funciona — com o motor real, o banco real e o
  modelo real, mensagem por mensagem.

  A diferença importa: um teste unitário pergunta "o resolvedor entende
  'aquele valor'?". Este pergunta "o cliente que escreve 'aquele valor'
  recebe uma resposta que faz sentido?".

  Confere o ESTADO depois de cada passo, que é o que determina se a próxima
  mensagem vai fazer sentido.
  ============================================================================
*/

const resultados = [];

function conferir(nome, ok, detalhe = "") {
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${nome}${detalhe ? `  \x1b[2m${detalhe}\x1b[0m` : ""}`);
  resultados.push({ nome, ok: !!ok, detalhe });
}

function passo(t) {
  console.log(`\n\x1b[1m── ${t} ${"─".repeat(Math.max(0, 54 - t.length))}\x1b[0m`);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const ambiente = lerAmbiente();
const supabase = criarClienteDoMotor(ambiente);
const usuario = await entrarNaConta(supabase, ambiente);
const userId = usuario.id;

const enviadas = [];
const gravador = {
  async sendMessage(_destino, texto) {
    enviadas.push(texto);
    console.log(`    \x1b[36m→\x1b[0m ${texto.replace(/\n/g, " ")}`);
    return { id: { _serialized: "fake" } };
  },
};

const fluxo = criarFluxo(supabase, userId);
const escuta = criarEscuta({
  supabase,
  fluxo,
  maestro: { clientePara: () => gravador, qualquerCliente: () => gravador },
  userId,
});

const TELEFONE = `5599${Date.now().toString().slice(-7)}`;
let idConversa = null;
let prefsOriginais = null;
let desligar = null;

/* Quantas vezes o bot perguntou algo que já sabia. É a métrica do bug. */
let perguntasRepetidas = 0;
let recuperadasDaMemoria = 0;
let referenciasResolvidas = 0;

function contouRepetida(texto, estado) {
  const perguntouConvenio = /aposentad\w*\/pensionista|INSS ou servidor/i.test(texto);
  const perguntouBanco = /em qual banco/i.test(texto);

  if (perguntouConvenio && estado?.convenio) perguntasRepetidas++;
  if (perguntouBanco && estado?.banco) perguntasRepetidas++;
}

/*
  Resolver a referência nem sempre vira mensagem enviada.

  Quando a resposta carrega o valor da simulação, ela vira RASCUNHO
  esperando aprovação — e isso é o comportamento certo, não uma falha. A
  primeira versão deste teste contava só envios e marcava como não-resolvida
  uma referência que tinha sido resolvida perfeitamente.

  O que prova a resolução é ter saído alguma coisa: mensagem OU rascunho.
*/
async function saiuAlgumaCoisa(desdeQuando) {
  if (enviadas.length) return true;

  const { count } = await supabase
    .from("rascunhos")
    .select("id", { count: "exact", head: true })
    .eq("id_conversa", idConversa)
    .gte("criado_em", desdeQuando);

  return (count ?? 0) > 0;
}

async function clienteDiz(texto) {
  console.log(`\n  \x1b[33m← cliente:\x1b[0m ${texto}`);
  enviadas.length = 0;

  const comecou = new Date().toISOString();
  const { data: conexoes } = await supabase.from("conexoes").select("id").limit(1);
  const conversa = await fluxo.registrar({
    idConexao: conexoes?.[0]?.id,
    idChat: `${TELEFONE}@c.us`,
    idMensagem: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    telefone: TELEFONE,
    nome: null,
    texto,
    direcao: "recebida",
  });

  idConversa = conversa.id;
  await fluxo.processarRecebida(conversa, texto, null);

  const fim = Date.now() + 25_000;
  while (Date.now() < fim && enviadas.length === 0) await dormir(300);

  const estado = await fluxo.memoria.ler(idConversa);
  for (const t of enviadas) contouRepetida(t, estado);

  return { saiu: enviadas.join(" | "), estado, respondeu: await saiuAlgumaCoisa(comecou) };
}

try {
  console.log("\n\x1b[1mvez · a conversa do Ademar\x1b[0m");
  console.log("─".repeat(60));

  const { data: prefs } = await supabase
    .from("preferencias")
    .select("modo, categorias")
    .eq("user_id", userId)
    .maybeSingle();
  prefsOriginais = prefs ?? { modo: "manual", categorias: [] };

  await supabase.from("preferencias").upsert(
    {
      user_id: userId,
      modo: "autonomo",
      categorias: ["saudacao", "prazo", "documentos", "horario", "duvida", "outro", "acompanhamento", "elegibilidade"],
    },
    { onConflict: "user_id" }
  );

  desligar = escuta.ligar();

  /* ---------------- BOT: a abordagem ---------------- */

  passo("BOT — a abordagem do Ryan");

  const abordagem = montarAbordagem({ nome: "Ademar Elleres", banco: "Santander" });
  console.log(`    \x1b[36m→\x1b[0m ${abordagem}`);

  const { data: conexoes } = await supabase.from("conexoes").select("id").limit(1);
  const c = await fluxo.registrar({
    idConexao: conexoes?.[0]?.id,
    idChat: `${TELEFONE}@c.us`,
    idMensagem: `adm_abordagem_${Date.now()}`,
    telefone: TELEFONE,
    nome: "Ademar Elleres",
    texto: abordagem,
    direcao: "enviada",
  });
  idConversa = c.id;

  const apos = await fluxo.memoria.ler(idConversa);

  conferir("aprendeu o nome da própria abordagem", apos?.nome === "Ademar", `nome=${apos?.nome}`);
  conferir("aprendeu o banco da própria abordagem", apos?.banco === "Santander", `banco=${apos?.banco}`);
  conferir("marcou como prospecção", apos?.origem === "prospeccao", `origem=${apos?.origem}`);
  conferir("está esperando a resposta", apos?.aguardando === "resposta_da_abordagem", apos?.aguardando);

  if (apos?.nome === "Ademar") recuperadasDaMemoria++;
  if (apos?.banco === "Santander") recuperadasDaMemoria++;

  /* ---------------- 1. "Preciso saber se ainda libera pra mim" ---------------- */

  passo('CLIENTE — "Preciso saber se ainda libera pra mim"');

  const p1 = await clienteDiz("Preciso saber se ainda libera pra mim");

  conferir(
    "NÃO perguntou convênio nem banco de novo",
    !/aposentad\w*\/pensionista|em qual banco/i.test(p1.saiu),
    p1.saiu.slice(0, 80) || "(foi pra Fila)"
  );
  conferir("nenhum valor vazou", numerosDeRisco(p1.saiu).length === 0);

  const { data: pend } = await supabase
    .from("pendencias")
    .select("id, motivo")
    .eq("id_conversa", idConversa)
    .eq("status", "aberta")
    .maybeSingle();

  conferir("foi pra sua Fila — o número é seu", !!pend, pend?.motivo);

  /* ---------------- VOCÊ responde ---------------- */

  passo("VOCÊ — responde na Fila");

  if (pend) {
    const RESPOSTA = "consegui 4200 em 12x de 380";
    console.log(`    \x1b[35m← você:\x1b[0m ${RESPOSTA}`);

    await supabase
      .from("pendencias")
      .update({ status: "respondida", resposta: RESPOSTA, respondida_em: new Date().toISOString() })
      .eq("id", pend.id);

    /*
      Espera a SIMULAÇÃO aparecer no estado, não a mensagem sair.

      São dois eventos e eles não são simultâneos: o rascunho nasce, a
      escuta manda na varredura seguinte, e a gravação da simulação
      acontece no meio. Esperar pelo envio media a coisa errada — o teste
      acusava "não guardou" e a asserção seguinte usava o valor guardado.
    */
    const fim = Date.now() + 45_000;
    enviadas.length = 0;
    let comSimulacao = null;

    while (Date.now() < fim) {
      comSimulacao = await fluxo.memoria.ler(idConversa);
      if (comSimulacao?.simulacao?.valor) break;
      await dormir(500);
    }

    conferir(
      "guardou a simulação que VOCÊ passou",
      !!comSimulacao?.simulacao?.valor,
      comSimulacao?.simulacao?.valor
    );
    conferir(
      "com procedência de consultor",
      comSimulacao?.simulacao?.de === "consultor",
      comSimulacao?.simulacao?.de
    );
    if (comSimulacao?.simulacao?.valor) recuperadasDaMemoria++;
  }

  /* ---------------- 2. "Aquele valor" ---------------- */

  passo('CLIENTE — "Aquele valor"');

  const p2 = await clienteDiz("Aquele valor");

  conferir(
    "entendeu que fala da simulação, não recomeçou",
    !/aposentad\w*\/pensionista|em qual banco/i.test(p2.saiu),
    p2.saiu.slice(0, 80) || "(nada)"
  );
  if (p2.respondeu) referenciasResolvidas++;

  /* ---------------- 3. "Você já me disse o valor" ---------------- */

  passo('CLIENTE — "Você já me disse o valor"');

  const p3 = await clienteDiz("Você já me disse o valor");

  conferir(
    "NÃO perguntou benefício, banco nem contrato",
    !/aposentad\w*\/pensionista|em qual banco|qual contrato/i.test(p3.saiu),
    p3.saiu.slice(0, 80) || "(nada)"
  );
  if (p3.respondeu) referenciasResolvidas++;

  /* ---------------- 3b. Ninguém ouve o mesmo número duas vezes ---------------- */

  /*
    Isto lê a tabela, não o log. Os envios são assíncronos e as linhas
    aparecem fora de ordem no terminal — foi assim que uma duplicata
    passou despercebida numa rodada anterior.

    A pergunta é objetiva: entre tudo que o agente escreveu pra este
    cliente, quantas mensagens carregam o número da simulação? Uma. Ele
    ouviu, e depois disso o agente confirma sem repetir.
  */
  {
    const { data: tudo } = await supabase
      .from("rascunhos")
      .select("texto_sugerido, categoria, criado_em")
      .eq("id_conversa", idConversa)
      .order("criado_em");

    const comONumero = (tudo ?? []).filter((r) => /4\.?200/.test(r.texto_sugerido ?? ""));

    conferir(
      "disse o número UMA vez, não repetiu",
      comONumero.length <= 1,
      `${comONumero.length} mensagem(ns) com o número`
    );

    for (const r of tudo ?? []) {
      console.log(`    [2m· ${r.categoria.padEnd(15)} ${r.texto_sugerido.slice(0, 70)}[0m`);
    }
  }

  /* ---------------- 4. "Mas por quê? Você nem pediu isso" ---------------- */

  passo('CLIENTE — "Mas por quê? Você nem pediu isso"');

  const p4 = await clienteDiz("Mas por quê? Você nem pediu isso");

  /*
    Lido da tabela, não do que a escuta alcançou enviar. Os envios são
    assíncronos: a resposta da mensagem anterior pode cair dentro da
    janela desta, e foi assim que uma rodada mostrou a confirmação de
    valor no lugar do recuo. O último rascunho da conversa é o que este
    passo produziu.
  */
  const { data: ultimos } = await supabase
    .from("rascunhos")
    .select("texto_sugerido")
    .eq("id_conversa", idConversa)
    .order("criado_em", { ascending: false })
    .limit(1);

  const oRecuo = ultimos?.[0]?.texto_sugerido ?? "";

  conferir(
    "recuou de verdade: admitiu, não confirmou valor",
    /raz[ãa]o|verdade|justo|adiantei|etapa/i.test(oRecuo),
    oRecuo.slice(0, 80) || "(nada)"
  );

  conferir(
    "respondeu olhando o que já tem, sem reiniciar",
    !/aposentad\w*\/pensionista|em qual banco/i.test(p4.saiu),
    p4.saiu.slice(0, 90) || "(nada)"
  );
  if (p4.respondeu) referenciasResolvidas++;

  conferir("o estado sobreviveu à conversa inteira", !!p4.estado?.banco && !!p4.estado?.nome,
    `${p4.estado?.nome} · ${p4.estado?.banco} · etapa ${p4.estado?.etapa_comercial}`);

  /* ---------------- o veredito ---------------- */

  passo("O que importa");

  conferir("ZERO perguntas repetidas", perguntasRepetidas === 0, `${perguntasRepetidas} repetida(s)`);
  conferir("recuperou da memória", recuperadasDaMemoria >= 2, `${recuperadasDaMemoria} informações`);
  conferir("resolveu as referências", referenciasResolvidas >= 3, `${referenciasResolvidas} de 3`);
} catch (erro) {
  console.log(`\n\x1b[31m✗ PAROU: ${erro.message}\x1b[0m`);
  console.log(erro.stack?.split("\n").slice(1, 4).join("\n"));
  resultados.push({ nome: `PAROU: ${erro.message}`, ok: false });
} finally {
  desligar?.();
  if (idConversa) await supabase.from("conversas").delete().eq("id", idConversa);
  if (prefsOriginais) {
    await supabase
      .from("preferencias")
      .update({ modo: prefsOriginais.modo, categorias: prefsOriginais.categorias })
      .eq("user_id", userId);
  }
  console.log(`\nlimpo · modo devolvido para "${prefsOriginais?.modo}"`);
}

const falhas = resultados.filter((r) => !r.ok);
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} passaram`);
console.log(`  perguntas repetidas: ${perguntasRepetidas}`);
console.log(`  recuperadas da memória: ${recuperadasDaMemoria}`);
console.log(`  referências resolvidas: ${referenciasResolvidas}\n`);

process.exit(falhas.length ? 1 : 0);
