import { lerAmbiente } from "./ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "./supabase.js";
import { criarFluxo } from "./fluxo.js";
import { criarMaestro } from "./conexoes.js";
import { criarEscuta } from "./escuta.js";
import { criarSeguimento } from "./seguimento.js";
import { pegarTrava, soltarTrava } from "./instancia.js";
import { criarObservador, EVENTOS } from "./observar.js";
import { criarBatimento } from "./batimento.js";
import { ondeCadaCoisaRoda } from "./ia.js";
import { groqVivo, groqConfigurado } from "./groq.js";
import {
  ollamaVivo,
  modeloDisponivel,
  aquecer,
  modeloEmUso,
  enderecoDoOllama,
} from "./ollama.js";
import { log } from "./log.js";

/*
  Confere a IA no boot e avisa alto se ela nao estiver la.
  Nao aborta: sem Ollama o produto continua util — so que TUDO vira pendencia
  e o consultor atende na mao. Melhor um bot que nao ajuda do que um que chuta.
*/
async function conferirIa() {
  if (!(await ollamaVivo())) {
    log.destaque(
      `⚠  Ollama não está rodando em ${enderecoDoOllama}.\n` +
        `   O motor vai funcionar, mas TUDO vai para a Fila — nada será respondido sozinho.\n` +
        `   Para ligar a IA: instale o Ollama e rode "ollama pull ${modeloEmUso}".`
    );
    return false;
  }

  if (!(await modeloDisponivel())) {
    log.destaque(
      `⚠  Ollama está de pé, mas o modelo ${modeloEmUso} não foi baixado.\n` +
        `   Rode: ollama pull ${modeloEmUso}\n` +
        `   Enquanto isso, tudo vai para a Fila.`
    );
    return false;
  }

  /*
    Confere o Groq AQUI, e não na primeira mensagem de cliente. Chave
    errada ou cota estourada é coisa que o consultor precisa saber no boot,
    com a máquina na frente dele — não vinte minutos depois, quando um
    cliente já está esperando e a única pista é uma linha no log.
  */
  if (groqConfigurado && !(await groqVivo())) {
    log.alerta(
      `A chave do Groq não foi aceita. Vou escrever com o modelo local (${modeloEmUso}), ` +
        `que escreve pior. Confira GROQ_API_KEY no .env.`
    );
  }

  const onde = ondeCadaCoisaRoda();
  log.info(`Pensa com ${onde.pensa} · escreve com ${onde.escreve}`);
  log.info(`IA pronta: ${modeloEmUso}. Carregando na memória…`);

  // Enquanto o WhatsApp ainda nem abriu, ninguem esta esperando resposta.
  // E a hora certa de pagar o custo de carregar o modelo.
  const segundos = await aquecer();
  if (segundos === null) {
    log.alerta("Não consegui aquecer o modelo; a primeira resposta vai demorar.");
  } else {
    log.info(`Modelo quente em ${segundos}s. Fica na memória por 30 minutos.`);
  }

  return true;
}

async function principal() {
  log.destaque("vez · motor");

  // Antes de qualquer coisa: nao pode existir um segundo motor.
  if (!pegarTrava()) process.exit(0);

  const ambiente = lerAmbiente();

  const supabase = criarClienteDoMotor(ambiente);
  const usuario = await entrarNaConta(supabase, ambiente);
  log.info(`Conta: ${usuario.email}`);

  await conferirIa();

  /*
    O diário e o batimento sobem antes de tudo que atende: se o WhatsApp
    falhar ao abrir, isso precisa aparecer no painel, e não só no terminal
    da máquina do consultor.
  */
  const observador = criarObservador({ supabase, userId: usuario.id });
  const batimento = criarBatimento({ supabase, userId: usuario.id });
  const pararBatimento = batimento.ligar();

  const fluxo = criarFluxo(supabase, usuario.id, { observador });
  const maestro = criarMaestro({
    supabase,
    fluxo,
    userId: usuario.id,
    aoMudarEstado: (estado, detalhe) => batimento.marcar(estado, detalhe),
  });

  /*
    A escuta do painel e o follow-up sobem junto com o motor, nao junto com
    um numero especifico: eles atendem todos. Quem decide por qual numero
    cada mensagem sai e o maestro, olhando a conversa.
  */
  const escuta = criarEscuta({ supabase, fluxo, maestro, userId: usuario.id, observador });
  const seguimento = criarSeguimento({ supabase, maestro, userId: usuario.id, observador });

  const desligarEscuta = escuta.ligar();
  const desligarSeguimento = seguimento.ligar();

  log.info("De olho no painel: respostas da fila e rascunhos aprovados.");
  log.info("Follow-up ligado: cobra quem sumiu, das 8h às 20h, no máximo 3 vezes.");

  // Fechar o programa tem que apagar a luz no painel, senao ele mente.
  let saindo = false;
  const encerrar = async (sinal) => {
    if (saindo) return;
    saindo = true;
    log.info(`Encerrando (${sinal})…`);
    desligarEscuta?.();
    desligarSeguimento?.();
    await maestro.desligarTudo();
    // O diário sai por último: ele tem que registrar o que aconteceu até agora.
    await observador.terminar();
    await pararBatimento();
    soltarTrava();
    process.exit(0);
  };

  process.on("SIGINT", () => encerrar("Ctrl+C"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));

  /*
    Erro que ninguém pegou. Sem estes dois, uma promessa rejeitada em
    qualquer canto derruba o Node em silêncio e o consultor descobre horas
    depois que o bot parou — o pior modo de falha que este produto tem.
  */
  process.on("unhandledRejection", (erro) => {
    log.erro(`Erro solto: ${erro?.message ?? erro}`);
    observador.registrar(EVENTOS.ERRO, { ok: false, detalhe: `erro solto: ${erro?.message}` });
    batimento.marcar("erro", String(erro?.message ?? erro).slice(0, 200));
  });

  process.on("uncaughtException", (erro) => {
    log.erro(`Erro grave: ${erro.message}`);
    batimento.marcar("erro", erro.message.slice(0, 200));
    // Aqui o processo está mesmo comprometido; sair é mais honesto que fingir.
    encerrar("erro grave");
  });

  log.info("Abrindo seus números… na primeira vez isso demora um pouco.");
  await maestro.ligar();
}

principal().catch(async (erro) => {
  log.erro(erro.message);
  process.exit(1);
});
