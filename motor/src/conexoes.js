import { criarEstado } from "./estado.js";
import { criarWhatsApp, pedirNovoPareamento } from "./whatsapp.js";
import { log } from "./log.js";

/*
  ============================================================================
  O MAESTRO DOS NÚMEROS

  Um consultor tem número comercial, número antigo que ainda recebe cliente,
  às vezes um por convênio. Este arquivo mantém um WhatsApp de pé para cada
  linha ativa em `conexoes`, e obedece o painel: número novo cadastrado lá,
  ele sobe; desconexão pedida lá, ele desconecta.

  O painel roda na Vercel e não alcança esta máquina. Toda ordem vem por
  bandeira no banco, e é o motor que vem buscar.

  Custo: cada número é um Chromium próprio, ~350MB. Com o modelo de IA na
  memória, uma máquina de 8GB aguenta dois ou três. Por isso o aviso.
  ============================================================================
*/

const RECONFERIR_MS = 30_000;
const CONFORTAVEL = 3;

export function criarMaestro({ supabase, fluxo, userId }) {
  // idConexao -> { cliente, estado, apelido }
  const ligados = new Map();
  let relogio = null;
  let avisouDeRam = false;

  /* Primeira execução: cria o "Principal" pra não exigir cadastro nenhum. */
  async function garantirPrimeiraConexao() {
    const { count } = await supabase
      .from("conexoes")
      .select("id", { count: "exact", head: true });

    if ((count ?? 0) > 0) return;

    const { error } = await supabase
      .from("conexoes")
      .insert({ user_id: userId, apelido: "Principal", estado: "desligado" });

    if (error) throw new Error(`criar a primeira conexão: ${error.message}`);
    log.info('Criei a conexão "Principal" pra você.');
  }

  async function listar() {
    const { data, error } = await supabase
      .from("conexoes")
      .select("id, apelido, ativa, desconectar_pedido")
      .order("apelido");

    if (error) {
      log.erro(`não consegui ler as conexões: ${error.message}`);
      return null;
    }
    return data ?? [];
  }

  async function ligar(conexao) {
    const apelido = conexao.apelido ?? "Principal";
    log.info(`[${apelido}] abrindo o WhatsApp…`);

    const estado = criarEstado(supabase, conexao.id, apelido);
    await estado.anotar({ estado: "iniciando", detalhe: "Abrindo o WhatsApp." });
    estado.baterCoracao();

    const cliente = criarWhatsApp({ conexao, estado, fluxo });
    ligados.set(conexao.id, { cliente, estado, apelido });

    // initialize() demora e pode falhar; nao pode travar os outros numeros.
    cliente.initialize().catch(async (erro) => {
      log.erro(`[${apelido}] não abriu: ${erro.message}`);
      await estado.desligar(`Não consegui abrir o WhatsApp: ${erro.message}`);
      ligados.delete(conexao.id);
    });
  }

  async function desligar(id, detalhe) {
    const vivo = ligados.get(id);
    if (!vivo) return;

    ligados.delete(id);
    try {
      await vivo.cliente.destroy();
    } catch {
      // Se o navegador ja caiu, nao ha o que fechar.
    }
    await vivo.estado.desligar(detalhe);
    log.info(`[${vivo.apelido}] desligado.`);
  }

  /* O consultor pediu desconexão no painel: desparea de verdade. */
  async function atenderPedidoDeDesconexao(conexao) {
    const vivo = ligados.get(conexao.id);
    log.alerta(`[${conexao.apelido}] desconectando a pedido do painel…`);

    if (vivo) {
      try {
        // logout() remove o aparelho do celular, nao so fecha aqui.
        await vivo.cliente.logout();
      } catch {
        // Sessao ja morta: seguir para a limpeza mesmo assim.
      }
    }

    pedirNovoPareamento(conexao.id);
    await desligar(conexao.id, "Você desconectou este número pelo painel.");

    await supabase
      .from("conexoes")
      .update({ desconectar_pedido: false, telefone: null, aparelho: null })
      .eq("id", conexao.id);
  }

  async function reconferir() {
    const conexoes = await listar();
    if (!conexoes) return;

    const ativas = conexoes.filter((c) => c.ativa);

    if (ativas.length > CONFORTAVEL && !avisouDeRam) {
      avisouDeRam = true;
      log.alerta(
        `${ativas.length} números ao mesmo tempo. Cada um usa ~350MB de memória — ` +
          `se a máquina começar a travar, pause algum no painel.`
      );
    }

    for (const conexao of conexoes) {
      if (conexao.desconectar_pedido) {
        await atenderPedidoDeDesconexao(conexao);
        continue;
      }
      if (!conexao.ativa) {
        await desligar(conexao.id, "Número pausado no painel.");
        continue;
      }
      if (!ligados.has(conexao.id)) {
        await ligar(conexao);
      }
    }

    // Linha apagada no painel: derruba o cliente que sobrou.
    const idsQueExistem = new Set(conexoes.map((c) => c.id));
    for (const id of [...ligados.keys()]) {
      if (!idsQueExistem.has(id)) await desligar(id, null);
    }
  }

  return {
    async ligar() {
      await garantirPrimeiraConexao();
      await reconferir();

      relogio = setInterval(() => {
        reconferir().catch((e) => log.erro(`conexões: ${e.message}`));
      }, RECONFERIR_MS);
      relogio.unref?.();
    },

    /* Usado por escuta e follow-up: por qual número esta conversa fala? */
    clientePara(idConexao) {
      const vivo = ligados.get(idConexao);
      return vivo?.cliente ?? null;
    },

    /* Qualquer número conectado — pro caso de conversa antiga sem número. */
    qualquerCliente() {
      for (const vivo of ligados.values()) {
        if (vivo.cliente.info?.wid) return vivo.cliente;
      }
      return null;
    },

    quantosLigados() {
      return ligados.size;
    },

    async desligarTudo() {
      if (relogio) clearInterval(relogio);
      relogio = null;
      for (const id of [...ligados.keys()]) {
        await desligar(id, "O motor foi fechado nesta máquina.");
      }
    },
  };
}
