import { WhatsAppWebPlaywrightProvider } from "./whatsapp_web_playwright.js";
import { EVENTOS_PROVEDOR, ESTADOS_PROVEDOR } from "./provedor_base.js";
import { log } from "../log.js";

/*
  ============================================================================
  MAESTRO PLAYWRIGHT — GESTOR DE WHATSAPP WEB VIA PLAYWRIGHT
  
  Conecta o WhatsAppWebPlaywrightProvider ao banco Supabase, ao fluxo de
  atendimento da IA e à escuta de rascunhos.
  
  Compatível com a interface do Maestro:
  - clientePara(idConexao): { sendMessage(destino, texto) }
  - qualquerCliente(): { sendMessage(destino, texto) }
  - ligar()
  - desligarTudo()
  ============================================================================
*/

export function criarMaestroPlaywright({
  supabase,
  userId,
  fluxo,
  aoMudarEstado = () => {},
  diretorioSessao,
  headless,
}) {
  const provedor = new WhatsAppWebPlaywrightProvider({
    diretorioSessao,
    headless,
  });

  let idConexaoBanco = null;

  async function sincronizarEstadoBanco(estado, qr = null) {
    aoMudarEstado(estado, qr ? "QR Code disponível" : provedor.detalheEstado);

    try {
      // Localiza ou garante conexão no banco
      if (!idConexaoBanco) {
        const { data: conx } = await supabase
          .from("conexoes")
          .select("id")
          .eq("tipo_provedor", "whatsapp_web")
          .maybeSingle();

        if (conx) {
          idConexaoBanco = conx.id;
        } else {
          const { data: criada } = await supabase
            .from("conexoes")
            .insert({
              user_id: userId,
              apelido: "WhatsApp Web (Playwright)",
              tipo_provedor: "whatsapp_web",
              estado: "desligado",
              ativa: true,
            })
            .select("id")
            .maybeSingle();
          idConexaoBanco = criada?.id || null;
        }
      }

      if (idConexaoBanco) {
        const mudanca = {
          estado: estado === ESTADOS_PROVEDOR.CONECTADO ? "conectado" : estado === ESTADOS_PROVEDOR.AGUARDANDO_QR ? "aguardando_qr" : estado === ESTADOS_PROVEDOR.RECONECTANDO ? "iniciando" : "desligado",
          qr_code: qr || null,
          atualizado_em: new Date().toISOString(),
        };
        await supabase.from("conexoes").update(mudanca).eq("id", idConexaoBanco);
      }
    } catch (e) {
      // Banco pode ter schema legado em testes
    }
  }

  // Escuta eventos do provedor Playwright
  provedor.on(EVENTOS_PROVEDOR.ESTADO_MUDOU, ({ estado, detalhe }) => {
    sincronizarEstadoBanco(estado).catch(() => {});
  });

  provedor.on(EVENTOS_PROVEDOR.QR_RECEBIDO, (qr) => {
    sincronizarEstadoBanco(ESTADOS_PROVEDOR.AGUARDANDO_QR, qr).catch(() => {});
  });

  provedor.on(EVENTOS_PROVEDOR.MENSAGEM_RECEBIDA, async (msg) => {
    if (!fluxo) return;

    try {
      const conversa = await fluxo.registrar({
        idConexao: idConexaoBanco,
        idChat: `${msg.telefone}@c.us`,
        idMensagem: msg.id,
        telefone: msg.telefone,
        nome: msg.nomeContato,
        texto: msg.texto,
        direcao: "recebida",
        timestamp: msg.timestamp,
      });

      if (conversa && !conversa.jaVista) {
        await fluxo.processarRecebida(conversa, msg.texto, msg.nomeContato);
      }
    } catch (erro) {
      log.erro(`[Maestro Playwright] Erro ao processar mensagem recebida: ${erro.message}`);
    }
  });

  const clienteWhatsApp = {
    async sendMessage(destino, texto) {
      const resp = await provedor.enviarTexto(destino, texto);
      if (!resp.ok) {
        throw new Error(resp.erro || "Falha no envio via Playwright");
      }
      return { id: resp.idMensagem || `pw_${Date.now()}` };
    },
    info: {
      wid: { user: "playwright_user" },
    },
  };

  return {
    provedor,

    async ligar() {
      log.info("[Maestro Playwright] Inicializando WhatsApp Web Playwright...");
      await provedor.iniciar();
    },

    async desligarTudo() {
      await provedor.parar();
      await sincronizarEstadoBanco(ESTADOS_PROVEDOR.DESLIGADO);
    },

    clientePara(idConexao) {
      if (!provedor.conectado) return null;
      return clienteWhatsApp;
    },

    qualquerCliente() {
      if (!provedor.conectado) return null;
      return clienteWhatsApp;
    },

    quantosLigados() {
      return provedor.conectado ? 1 : 0;
    },
  };
}
