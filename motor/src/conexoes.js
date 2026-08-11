import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./ambiente.js";
import { criarEstado } from "./estado.js";
import { criarWhatsApp, pedirNovoPareamento, apelidoCurto } from "./whatsapp.js";
import { matarChromiumsOrfaos } from "./limpeza.js";
import { importarHistorico } from "./importar.js";
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
      .select("id, apelido, ativa, desconectar_pedido, importar_dias")
      .order("apelido");

    if (error) {
      log.erro(`não consegui ler as conexões: ${error.message}`);
      return null;
    }
    return data ?? [];
  }

  /*
    Abrir o WhatsApp Web falha de vez em quando com "Execution context was
    destroyed": a pagina recarrega no meio da inicializacao e o puppeteer
    perde o contexto. Quase sempre a segunda tentativa pega. Na ultima, a
    sessao e apagada — se o que estava gravado e que esta ruim, comecar do
    QR resolve.
  */
  const TENTATIVAS = 3;
  const DESCANSO_MS = 5 * 60 * 1000;

  // idConexao -> instante a partir do qual pode tentar de novo
  const emEspera = new Map();

  /*
    Conexoes com abertura em andamento.

    Sem isto acontece o pior bug desta parte: uma tentativa falha, a conexao
    sai de `ligados`, e a reconferencia de 30s ve que ela nao esta ligada e
    inicia OUTRA abertura em paralelo com a retentativa. Dois Chromium
    disputando o mesmo perfil derrubam um ao outro, e o erro que aparece —
    "Execution context was destroyed" — nao tem nada a ver com a causa.
  */
  const abrindo = new Set();

  async function ligar(conexao, tentativa = 1) {
    if (abrindo.has(conexao.id)) return;
    abrindo.add(conexao.id);

    const apelido = conexao.apelido ?? "Principal";
    log.info(
      `[${apelido}] abrindo o WhatsApp…${tentativa > 1 ? ` (tentativa ${tentativa})` : ""}`
    );

    const estado = criarEstado(supabase, conexao.id, apelido);
    await estado.anotar({ estado: "iniciando", detalhe: "Abrindo o WhatsApp." });
    estado.baterCoracao();

    const cliente = criarWhatsApp({ conexao, estado, fluxo });
    ligados.set(conexao.id, { cliente, estado, apelido });

    // initialize() demora e pode falhar; nao pode travar os outros numeros.
    cliente.initialize().then(
      () => abrindo.delete(conexao.id),
      async (erro) => {
      log.erro(`[${apelido}] não abriu: ${erro.message}`);
      ligados.delete(conexao.id);

      try {
        await cliente.destroy();
      } catch {
        // Navegador ja morto: nada a fechar.
      }

      if (tentativa >= TENTATIVAS) {
        /*
          Desistiu. Sem esta espera, a reconferencia de 30s recomeçaria o
          ciclo pra sempre — e o log vira uma parede de erro que esconde
          qualquer outra coisa acontecendo.
        */
        abrindo.delete(conexao.id);
        emEspera.set(conexao.id, Date.now() + DESCANSO_MS);
        await estado.desligar(
          `Não consegui abrir o WhatsApp depois de ${TENTATIVAS} tentativas: ${erro.message}`
        );
        log.alerta(`[${apelido}] vou tentar de novo em 5 minutos.`);
        return;
      }

      // Na ultima tentativa, comeca do zero.
      if (tentativa === TENTATIVAS - 1) {
        pedirNovoPareamento(conexao.id);
        log.alerta(`[${apelido}] vou apagar a sessão e pedir o QR de novo.`);
      }

      await estado.anotar({
        estado: "iniciando",
        detalhe: `Tentando abrir de novo (${tentativa + 1} de ${TENTATIVAS})…`,
      });

      setTimeout(() => {
        // Libera a trava so na hora de recomecar, nunca antes: e ela que
        // impede a reconferencia de abrir um segundo Chromium no meio.
        abrindo.delete(conexao.id);
        ligar(conexao, tentativa + 1).catch((e) =>
          log.erro(`[${apelido}] ${e.message}`)
        );
      }, 8000);
      }
    );
  }

  /*
    Conexao apagada no painel deixa pra tras um perfil inteiro de Chromium
    (dezenas de MB). Sem esta limpeza, a pasta sessao/ so cresce.
  */
  function varrerSessoesOrfas(idsQueExistem) {
    const raizDasSessoes = path.join(RAIZ, "sessao", "wa");
    if (!fs.existsSync(raizDasSessoes)) return;

    // As pastas usam o apelido curto do id, nao o UUID inteiro.
    const curtosVivos = new Set([...idsQueExistem].map(apelidoCurto));

    for (const nome of fs.readdirSync(raizDasSessoes)) {
      if (curtosVivos.has(nome)) continue;

      try {
        fs.rmSync(path.join(raizDasSessoes, nome), { recursive: true, force: true });
        log.info(`Limpei uma sessão que não pertence mais a nenhum número.`);
      } catch {
        // Em uso por um Chromium que ainda nao morreu: tenta na proxima volta.
      }
    }
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

  /*
    O painel pediu o histórico. Só roda com o número já conectado — e a
    bandeira é zerada ANTES de importar: se a importação demorar mais que os
    30s da reconferência, ela não pode ser disparada duas vezes em paralelo.
  */
  async function atenderPedidoDeImportacao(conexao) {
    const vivo = ligados.get(conexao.id);
    if (!vivo || !vivo.cliente.info?.wid) return;

    const dias = conexao.importar_dias;

    await supabase
      .from("conexoes")
      .update({ importar_dias: 0 })
      .eq("id", conexao.id);

    try {
      await vivo.estado.anotar({
        estado: "conectado",
        detalhe: `Importando os últimos ${dias} dia(s)…`,
      });

      const r = await importarHistorico({
        supabase,
        cliente: vivo.cliente,
        userId,
        idConexao: conexao.id,
        apelido: vivo.apelido,
        dias,
      });

      await vivo.estado.anotar({
        estado: "conectado",
        detalhe:
          `Importei ${r.novasConversas} conversa(s). ` +
          `${r.esperandoVoce} falaram por último e não foram respondidas. ` +
          `Nada foi respondido automaticamente.`,
      });
    } catch (erro) {
      log.erro(`[${vivo.apelido}] importação falhou: ${erro.message}`);
      await vivo.estado.anotar({
        estado: "conectado",
        detalhe: `A importação falhou: ${erro.message}`,
      });
    }
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
      if (!ligados.has(conexao.id) && !abrindo.has(conexao.id)) {
        const descansando = emEspera.get(conexao.id);
        if (descansando && Date.now() < descansando) continue;
        emEspera.delete(conexao.id);
        await ligar(conexao);
        continue;
      }

      // Ja conectado: o painel pediu pra trazer o historico?
      if (conexao.importar_dias > 0) await atenderPedidoDeImportacao(conexao);
    }

    // Linha apagada no painel: derruba o cliente que sobrou.
    const idsQueExistem = new Set(conexoes.map((c) => c.id));
    for (const id of [...ligados.keys()]) {
      if (!idsQueExistem.has(id)) await desligar(id, null);
    }

    varrerSessoesOrfas(idsQueExistem);
  }

  return {
    async ligar() {
      // Antes de abrir qualquer coisa: tira do caminho os Chromium que
      // sobraram da ultima vez e ainda seguram o lock das sessoes.
      await matarChromiumsOrfaos();

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
