import { lerAmbiente } from "../ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "../supabase.js";
import { criarFluxo } from "../fluxo.js";
import { criarEscuta } from "../escuta.js";

/*
  ============================================================================
  SÓ O CENÁRIO 7, REPETIDO

  O E2E inteiro leva 15 minutos, e o cenário que falha é um só: o cliente
  pergunta o prazo, o bot tem a resposta no manual, e mesmo assim a mensagem
  não sai.

  Rodar a conversa inteira pra ver um passo é caro demais pra investigar. Isto
  monta o MESMO estado — memória cheia, o bot já tendo pedido o extrato de
  margem, a pergunta de prazo — e roda só ele, quantas vezes eu quiser.

  Usa o fluxo de produção inteiro. Limpa o que cria.
  ============================================================================
*/

const VEZES = Number(process.argv[2]) || 3;

const ambiente = lerAmbiente();
const supabase = criarClienteDoMotor(ambiente);
const usuario = await entrarNaConta(supabase, ambiente);
const userId = usuario.id;

const enviadas = [];
const gravador = {
  async sendMessage(destino, texto) {
    enviadas.push(texto);
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
const desligar = escuta.ligar();

const criadas = [];
const { data: conexoes } = await supabase.from("conexoes").select("id").limit(1);
const { data: prefs } = await supabase
  .from("preferencias")
  .select("modo, categorias")
  .eq("user_id", userId)
  .maybeSingle();

const original = prefs ?? { modo: "manual", categorias: [] };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await supabase.from("preferencias").upsert(
    { user_id: userId, modo: "autonomo", categorias: ["saudacao", "prazo", "documentos", "horario", "outro"] },
    { onConflict: "user_id" }
  );

  console.log(`\nCenário 7, ${VEZES}x — "depois que assina, quanto tempo demora pra cair?"\n`);

  let responderam = 0;

  for (let i = 1; i <= VEZES; i++) {
    const telefone = `5599${Date.now().toString().slice(-7)}${i}`;

    /*
      Monta o mesmo estado do E2E: o bot já pediu o extrato de margem, e
      essa frase está no contexto da conversa.
    */
    const c = await fluxo.registrar({
      idConexao: conexoes?.[0]?.id,
      idChat: `${telefone}@c.us`,
      idMensagem: `c7_${Date.now()}_${i}`,
      telefone,
      nome: null,
      texto: "sou aposentado do INSS, meu contrato é no Santander",
      direcao: "recebida",
    });
    criadas.push(c.id);

    await supabase.from("mensagens").insert({
      user_id: userId,
      id_conversa: c.id,
      direcao: "enviada",
      texto: "Oi! Pra eu continuar, me manda seu contracheque atualizado e me manda o extrato de margem.",
    });

    await fluxo.memoria.aprender(c.id, {
      nome: "Antonio",
      convenio: "inss",
      banco: "Santander",
    });

    enviadas.length = 0;
    const comecou = Date.now();

    const msg = await fluxo.registrar({
      idConexao: conexoes?.[0]?.id,
      idChat: `${telefone}@c.us`,
      idMensagem: `c7b_${Date.now()}_${i}`,
      telefone,
      nome: null,
      texto: "depois que assina, quanto tempo demora pra cair?",
      direcao: "recebida",
    });

    await fluxo.processarRecebida(msg, "depois que assina, quanto tempo demora pra cair?", null);

    // Espera a escuta mandar.
    const fim = Date.now() + 20_000;
    while (Date.now() < fim && enviadas.length === 0) await dormir(300);

    const saiu = enviadas[0] ?? "(nada)";
    const usouOManual = /2 dias|dois dias/i.test(saiu);
    if (usouOManual) responderam++;

    console.log(
      `  ${usouOManual ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${((Date.now() - comecou) / 1000).toFixed(1)}s  ${saiu.replace(/\n/g, " ").slice(0, 100)}`
    );
  }

  console.log(`\n  ${responderam}/${VEZES} usaram o manual\n`);
} finally {
  desligar?.();
  for (const id of criadas) await supabase.from("conversas").delete().eq("id", id);
  await supabase
    .from("preferencias")
    .update({ modo: original.modo, categorias: original.categorias })
    .eq("user_id", userId);
  console.log(`limpo · modo devolvido para "${original.modo}"`);
}
