import { lerAmbiente } from "./ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "./supabase.js";
import { criarEstado } from "./estado.js";
import { criarFluxo } from "./fluxo.js";
import { criarEscuta } from "./escuta.js";
import { criarWhatsApp } from "./whatsapp.js";
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

  log.info(`IA pronta: ${modeloEmUso}. Carregando na memória…`);

  // Enquanto o WhatsApp ainda nem abriu, ninguem esta esperando resposta.
  // E a hora certa de pagar o custo de carregar o modelo.
  const segundos = await aquecer();
  if (segundos === null) log.alerta("Não consegui aquecer o modelo; a primeira resposta vai demorar.");
  else log.info(`Modelo quente em ${segundos}s. Fica na memória por 30 minutos.`);

  return true;
}

async function principal() {
  log.destaque("vez · motor");

  const ambiente = lerAmbiente();

  const supabase = criarClienteDoMotor(ambiente);
  const usuario = await entrarNaConta(supabase, ambiente);
  log.info(`Conta: ${usuario.email}`);

  await conferirIa();

  const estado = criarEstado(supabase, usuario.id);
  const fluxo = criarFluxo(supabase, usuario.id);

  await estado.anotar({ estado: "iniciando", detalhe: "Abrindo o WhatsApp." });
  estado.baterCoracao();

  const whatsapp = criarWhatsApp({ estado, fluxo });

  // A escuta do painel so entra em cena quando o WhatsApp esta pronto:
  // ela pode precisar enviar mensagem a qualquer momento.
  let desligarEscuta = null;
  whatsapp.on("ready", () => {
    if (desligarEscuta) return;
    const escuta = criarEscuta({
      supabase,
      fluxo,
      whatsapp,
      userId: usuario.id,
    });
    desligarEscuta = escuta.ligar();
    log.info("De olho no painel: respostas da fila e rascunhos aprovados.");
  });

  // Fechar o programa tem que apagar a luz no painel, senao ele mente.
  let saindo = false;
  const encerrar = async (sinal) => {
    if (saindo) return;
    saindo = true;
    log.info(`Encerrando (${sinal})…`);
    desligarEscuta?.();
    await estado.desligar("O motor foi fechado nesta máquina.");
    try {
      await whatsapp.destroy();
    } catch {
      // Se o navegador ja caiu, nao ha o que fechar.
    }
    process.exit(0);
  };

  process.on("SIGINT", () => encerrar("Ctrl+C"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));

  log.info("Abrindo o WhatsApp… na primeira vez isso demora um pouco.");
  await whatsapp.initialize();
}

principal().catch(async (erro) => {
  log.erro(erro.message);
  process.exit(1);
});
