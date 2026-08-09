import { lerAmbiente } from "./ambiente.js";
import { criarClienteDoMotor, entrarNaConta } from "./supabase.js";
import { criarEstado } from "./estado.js";
import { criarFluxo } from "./fluxo.js";
import { criarWhatsApp } from "./whatsapp.js";
import { log } from "./log.js";

async function principal() {
  log.destaque("vez · motor");

  const ambiente = lerAmbiente();

  const supabase = criarClienteDoMotor(ambiente);
  const usuario = await entrarNaConta(supabase, ambiente);
  log.info(`Conta: ${usuario.email}`);

  const estado = criarEstado(supabase, usuario.id);
  const fluxo = criarFluxo(supabase, usuario.id);

  await estado.anotar({ estado: "iniciando", detalhe: "Abrindo o WhatsApp." });
  estado.baterCoracao();

  const whatsapp = criarWhatsApp({ estado, fluxo });

  // Fechar o programa tem que apagar a luz no painel, senao ele mente.
  let saindo = false;
  const encerrar = async (sinal) => {
    if (saindo) return;
    saindo = true;
    log.info(`Encerrando (${sinal})…`);
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
