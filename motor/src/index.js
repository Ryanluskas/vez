import { lerAmbiente } from "./ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "./supabase.js";
import { criarFluxo } from "./fluxo.js";
import { criarMaestro } from "./conexoes.js";
import { criarMaestroEvolution } from "./evolution/maestro.js";
import { criarServidorWebhook } from "./evolution/webhook.js";
import { criarMaestroPlaywright } from "./provedores/maestro_playwright.js";
import { obterTipoProvedorConfigurado } from "./provedores/gestor_provedor.js";
import { criarEscuta } from "./escuta.js";
import { criarSeguimento } from "./seguimento.js";
import { pegarTrava, soltarTrava } from "./instancia.js";
import { criarObservador, EVENTOS } from "./observar.js";
import { criarBatimento } from "./batimento.js";
import { ondeCadaCoisaRoda, gestorMultiprovedor } from "./ia.js";
import { groqVivo, groqConfigurado, modeloDoGroq } from "./groq.js";
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
  const ollamaOnline = await ollamaVivo();
  const temNuvem = groqConfigurado || gestorMultiprovedor.obterProvedor("gemini")?.estaConfigurado();

  if (!ollamaOnline) {
    if (temNuvem) {
      log.info(`IA Local (Ollama) desligada. Operando com provedor em nuvem (${groqConfigurado ? modeloDoGroq + " via Groq" : "Gestor Multiprovedor"}).`);
      return true;
    }

    log.destaque(
      `⚠  Ollama não está rodando em ${enderecoDoOllama} e nenhum provedor em nuvem (Groq/Gemini) foi configurado.\n` +
        `   O motor vai funcionar, mas TUDO vai para a Fila — nada será respondido sozinho.\n` +
        `   Para ligar a IA: configure GROQ_API_KEY no .env ou instale o Ollama.`
    );
    return false;
  }

  if (!(await modeloDisponivel())) {
    if (temNuvem) {
      log.info(`Modelo local ${modeloEmUso} ausente. Usando nuvem (${groqConfigurado ? modeloDoGroq : "Multiprovedor"}).`);
      return true;
    }

    log.destaque(
      `⚠  Ollama está de pé, mas o modelo ${modeloEmUso} não foi baixado.\n` +
        `   Rode: ollama pull ${modeloEmUso}\n` +
        `   Enquanto isso, tudo vai para a Fila.`
    );
    return false;
  }

  if (groqConfigurado && !(await groqVivo())) {
    log.alerta(
      `A chave do Groq não foi aceita. Vou escrever com o modelo local (${modeloEmUso}). ` +
        `Confira GROQ_API_KEY no .env.`
    );
  }

  const onde = ondeCadaCoisaRoda();
  log.info(`Pensa com ${onde.pensa} · escreve com ${onde.escreve}`);
  log.info(`IA pronta: ${modeloEmUso}. Carregando na memória…`);

  const segundos = await aquecer();
  if (segundos === null) {
    log.alerta("Não consegui aquecer o modelo; a primeira resposta vai demorar.");
  } else {
    log.info(`Modelo quente em ${segundos}s. Mantido na memória enquanto o motor rodar.`);
  }

  return true;
}

/*
  Reaquece o modelo antes de ele esfriar.

  O Ollama descarrega o modelo depois de 30 minutos parado, e recarregar
  2GB do disco leva ~40 segundos. Com o corte de 12s para classificar, isso
  significa que a PRIMEIRA mensagem depois de um período parado ia direto
  pra fila — e período parado é o normal: consultor recebe mensagem em
  rajada e depois fica horas sem nada.

  Uma chamada de um token a cada 20 minutos custa quase nada e faz o corte
  curto ser seguro. Sem isso, encurtar o tempo limite só trocaria "cliente
  esperando dois minutos" por "cliente indo pra fila à toa".
*/
const AQUECER_A_CADA_MS = 20 * 60 * 1000;

function manterQuente() {
  const relogio = setInterval(() => {
    aquecer().catch(() => {});
  }, AQUECER_A_CADA_MS);

  relogio.unref?.();
  return () => clearInterval(relogio);
}

async function principal() {
  log.destaque("vez · motor");

  // Antes de qualquer coisa: nao pode existir um segundo motor.
  if (!pegarTrava()) process.exit(0);

  const ambiente = lerAmbiente();

  const supabase = criarClienteDoMotor(ambiente);
  const usuario = await entrarNaConta(supabase, ambiente);
  log.info(`Conta: ${usuario.email}`);

  // Sincroniza configuração de IA multiprovedor com o painel e conecta telemetria
  gestorMultiprovedor.conectarBanco({ supabase, userId: usuario.id });
  await gestorMultiprovedor.sincronizarComBanco(supabase, usuario.id);

  const iaPronta = await conferirIa();
  const pararDeAquecer = iaPronta ? manterQuente() : () => {};

  /*
    O diário e o batimento sobem antes de tudo que atende: se o WhatsApp
    falhar ao abrir, isso precisa aparecer no painel, e não só no terminal
    da máquina do consultor.
  */
  const observador = criarObservador({ supabase, userId: usuario.id });
  const batimento = criarBatimento({ supabase, userId: usuario.id });
  const pararBatimento = batimento.ligar();

  const fluxo = criarFluxo(supabase, usuario.id, { observador });

  const tipoProvedor = obterTipoProvedorConfigurado();
  const usarEvolution = tipoProvedor === "evolution";
  let webhookServidor = null;
  let maestro = null;

  if (usarEvolution) {
    log.destaque("Gateway: Evolution API v2 (desacoplada via Docker)");
    maestro = criarMaestroEvolution({
      supabase,
      userId: usuario.id,
      aoMudarEstado: (estado, detalhe) => batimento.marcar(estado, detalhe),
    });

    const webhook = criarServidorWebhook({
      fluxo,
      supabase,
      porta: Number(process.env.VEZ_WEBHOOK_PORT) || 3333,
      webhookSecret: process.env.VEZ_WEBHOOK_SECRET || null,
      aoAtualizarEstado: (instancia, estado, qr) => {
        batimento.marcar(estado, `Instância: ${instancia}`);
        if (maestro?.notificarMudancaDeInstancia) {
          maestro.notificarMudancaDeInstancia(instancia, estado);
        }
      },
    });

    webhookServidor = webhook.iniciar();
  } else {
    log.destaque("Gateway: WhatsApp Web via Playwright (Chromium Nativo)");
    maestro = criarMaestroPlaywright({
      supabase,
      userId: usuario.id,
      fluxo,
      aoMudarEstado: (estado, detalhe) => batimento.marcar(estado, detalhe),
      headless: process.env.WHATSAPP_WEB_HEADLESS === "true",
    });
  }

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
    pararDeAquecer();
    if (webhookServidor) {
      try {
        webhookServidor.close();
      } catch {}
    }
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
