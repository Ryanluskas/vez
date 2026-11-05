import { criarClienteEvolution } from "./cliente.js";
import { log } from "../log.js";

/*
  ============================================================================
  MAESTRO EVOLUTION API — GESTOR DE INSTÂNCIAS DE WHATSAPP

  Mantém a sincronização entre as linhas em `conexoes` do Supabase e as
  instâncias ativas na Evolution API v2:
  - Cria instâncias automáticas na Evolution para conexões ativas
  - Configura webhooks com url e segredo de validação
  - Fornece a interface `clientePara(idConexao)` com método `sendMessage`
  - Monitora periodicamente a saúde das instâncias
  ============================================================================
*/

const RECONFERIR_MS = 30_000;

export function criarMaestroEvolution({
  supabase,
  userId,
  serverUrl = process.env.EVOLUTION_SERVER_URL || "http://localhost:8080",
  apiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || "vez_evolution_api_key_capitalcred_2026",
  webhookUrl = process.env.VEZ_WEBHOOK_URL || "http://host.docker.internal:3333/webhook",
  webhookSecret = process.env.VEZ_WEBHOOK_SECRET || null,
  aoMudarEstado = () => {},
}) {
  const clienteEvolution = criarClienteEvolution({ serverUrl, apiKey });
  // idConexao -> { conexao, apelido, estado }
  const instanciasLigadas = new Map();
  let relogio = null;

  async function listarConexoes() {
    let { data, error } = await supabase
      .from("conexoes")
      .select("id, apelido, ativa, estado, evolution_instancia, evolution_apikey, evolution_server_url, webhook_secret, tipo_provedor, telefone")
      .eq("tipo_provedor", "evolution")
      .order("apelido");

    if (error && (error.message.includes("evolution_instancia") || error.message.includes("tipo_provedor"))) {
      log.alerta(
        "[Evolution Maestro] ⚠ As novas colunas da Evolution API ainda não existem na tabela 'conexoes'.\n" +
        "  Execute banco/22_evolution_e_followups.sql no SQL Editor do Supabase."
      );
      const resLegado = await supabase
        .from("conexoes")
        .select("id, apelido, ativa, estado, telefone")
        .order("apelido");
      return resLegado.data ?? [];
    }

    if (error) {
      log.erro(`[Evolution Maestro] Erro ao ler conexões: ${error.message}`);
      return null;
    }
    return data ?? [];
  }

  async function sincronizarConexao(conexao) {
    const apelido = conexao.apelido || "Principal";
    const nomeInstancia =
      conexao.evolution_instancia ||
      `vez_${String(conexao.id).replace(/-/g, "").slice(0, 10)}`;

    // Se ainda não tiver o nome da instância salvo no banco, salva
    if (!conexao.evolution_instancia) {
      await supabase
        .from("conexoes")
        .update({
          evolution_instancia: nomeInstancia,
          tipo_provedor: "evolution",
        })
        .eq("id", conexao.id);
      conexao.evolution_instancia = nomeInstancia;
    }

    if (!conexao.ativa) {
      instanciasLigadas.delete(conexao.id);
      return;
    }

    try {
      const estadoAtual = await clienteEvolution.obterEstadoConexao({
        nomeInstancia,
      });

      if (estadoAtual === "open") {
        let telefoneReal = conexao.telefone;
        let aparelhoReal = conexao.aparelho;

        try {
          const instancias = await clienteEvolution.listarInstancias();
          const info = instancias.find((i) => i.name === nomeInstancia);
          if (info?.ownerJid) {
            telefoneReal = String(info.ownerJid).replace(/@.*$/, "").replace(/\D/g, "");
          }
          if (info?.profileName) {
            aparelhoReal = info.profileName;
          }
        } catch {}

        instanciasLigadas.set(conexao.id, {
          conexao: { ...conexao, telefone: telefoneReal, aparelho: aparelhoReal },
          nomeInstancia,
          estado: "conectado",
        });

        await supabase
          .from("conexoes")
          .update({
            estado: "conectado",
            telefone: telefoneReal,
            aparelho: aparelhoReal,
            qr: null,
            detalhe: "Conectado via Evolution API.",
            visto_em: new Date().toISOString(),
          })
          .eq("id", conexao.id);
        aoMudarEstado("ligado", apelido);
      } else {
        instanciasLigadas.delete(conexao.id);
        // Se a instância não está conectada, solicita conexão/QR
        const respostaConexao = await clienteEvolution
          .obterConexao({ nomeInstancia })
          .catch(async () => {
            // Se falhou ao obter conexão, tenta criar a instância primeiro
            return clienteEvolution.criarInstancia({
              nomeInstancia,
              webhookUrl,
              webhookSecret,
            });
          });

        const qrCodeBase64 =
          respostaConexao?.base64 ||
          respostaConexao?.qrcode?.base64 ||
          null;

        if (qrCodeBase64) {
          await supabase
            .from("conexoes")
            .update({
              estado: "aguardando_qr",
              qr: qrCodeBase64,
              detalhe: `Abra o WhatsApp e escaneie o QR da instância "${apelido}".`,
              visto_em: new Date().toISOString(),
            })
            .eq("id", conexao.id);
        }
      }
    } catch (err) {
      log.alerta(`[Evolution Maestro] Instância "${nomeInstancia}": ${err.message}`);
    }
  }

  async function reconferir() {
    const conexoes = await listarConexoes();
    if (!conexoes) return;

    for (const conexao of conexoes) {
      await sincronizarConexao(conexao);
    }
  }

  return {
    async ligar() {
      log.info("[Evolution Maestro] Iniciando gerenciador de instâncias...");
      let online = await clienteEvolution.estaOnline();
      if (!online) {
        // Tenta acordar a Evolution no WSL Ubuntu (padrão do whatsapp-simulacoes-bot)
        try {
          const { execSync } = await import("node:child_process");
          execSync("wsl.exe -d Ubuntu --exec true", { timeout: 5000, stdio: "ignore" });
          await new Promise((r) => setTimeout(r, 2500));
          online = await clienteEvolution.estaOnline();
        } catch {}
      }

      if (!online) {
        log.alerta(
          `[Evolution Maestro] Evolution API não respondeu em ${serverUrl}. ` +
            `Certifique-se de que o contêiner 'allana-evolution' está ativo no WSL Ubuntu.`
        );
      } else {
        log.destaque(`[Evolution Maestro] Conectado à Evolution API em ${serverUrl}.`);
      }

      await reconferir();
      relogio = setInterval(() => {
        reconferir().catch((e) => log.erro(`[Evolution Maestro] ${e.message}`));
      }, RECONFERIR_MS);
      relogio.unref?.();
    },

    clientePara(idConexao) {
      // Procura instância mapeada que esteja de fato conectada
      const item = idConexao ? instanciasLigadas.get(idConexao) : null;
      if (!item || item.estado !== "conectado") {
        return null;
      }

      const nomeInstancia = item.nomeInstancia;
      return {
        async sendMessage(destino, texto) {
          // Preserva JIDs completos com @ (como @lid e @s.whatsapp.net)
          const destinatario = String(destino || "").trim();
          return clienteEvolution.enviarTexto({
            nomeInstancia,
            numero: destinatario,
            texto,
          });
        },
        info: {
          wid: { user: item.conexao?.telefone || null },
        },
      };
    },

    qualquerCliente() {
      for (const [idConexao, item] of instanciasLigadas.entries()) {
        if (item.estado === "conectado") {
          return this.clientePara(idConexao);
        }
      }
      return null;
    },

    quantosLigados() {
      return instanciasLigadas.size;
    },

    notificarMudancaDeInstancia(nomeInstancia, estado) {
      for (const [idConexao, item] of instanciasLigadas.entries()) {
        if (item.nomeInstancia === nomeInstancia) {
          item.estado = estado;
          if (estado !== "conectado") {
            instanciasLigadas.delete(idConexao);
          }
          return;
        }
      }
      if (estado === "conectado") {
        reconferir().catch(() => {});
      }
    },

    async desligarTudo() {
      if (relogio) clearInterval(relogio);
      relogio = null;
      instanciasLigadas.clear();
      log.info("[Evolution Maestro] Encerrado.");
    },

    clienteHttp: clienteEvolution,
  };
}
