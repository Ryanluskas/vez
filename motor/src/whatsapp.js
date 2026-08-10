import fs from "node:fs";
import path from "node:path";
import wweb from "whatsapp-web.js";
import QRCode from "qrcode";
import { RAIZ } from "./ambiente.js";
import { avisoDeDocumento } from "./funil.js";
import { log } from "./log.js";

const { Client, LocalAuth } = wweb;

/* Mensagem sem texto ainda e informacao: melhor "[áudio]" do que uma linha vazia. */
const RECADO_POR_TIPO = {
  image: "[imagem]",
  video: "[vídeo]",
  audio: "[áudio]",
  ptt: "[áudio]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  vcard: "[contato]",
  multi_vcard: "[contatos]",
  revoked: "[mensagem apagada]",
};

function textoDaMensagem(msg) {
  const corpo = (msg.body ?? "").trim();
  const recado = RECADO_POR_TIPO[msg.type];

  if (!recado) return corpo;
  return corpo ? `${recado} ${corpo}` : recado;
}

/* Só conversa de pessoa: grupo, status e lista de transmissão ficam de fora. */
function ehConversaDeCliente(idDoChat) {
  return typeof idDoChat === "string" && idDoChat.endsWith("@c.us");
}

/* O que conta como "mandou documento". Áudio e figurinha não contam. */
const ARQUIVOS = new Set(["document", "image"]);

/*
  Manda o aviso pro WhatsApp do próprio consultor — a conversa que ele tem
  consigo mesmo. É notificação que chega no bolso dele, sem depender de ele
  estar com o painel aberto.
*/
async function avisarConsultor(cliente, texto) {
  try {
    const eu = cliente.info?.wid?._serialized;
    if (eu) await cliente.sendMessage(eu, texto);
  } catch (erro) {
    log.erro(`não consegui te avisar no WhatsApp: ${erro.message}`);
  }
}

const PASTA_DA_SESSAO = path.join(RAIZ, "sessao", "whatsapp");
const MARCA_DE_REPAREAR = path.join(RAIZ, "sessao", "refazer-pareamento");

/*
  Quando o WhatsApp desconecta com LOGOUT — o consultor removeu o aparelho
  pelo celular, ou a sessao expirou — as credenciais gravadas viram lixo.
  Reaproveitar elas faz o motor tentar autenticar com uma sessao morta em
  vez de mostrar QR novo, e ele fica preso nisso.

  Nao da pra apagar na hora do LOGOUT: o navegador ainda esta com os
  arquivos abertos. Entao deixa um bilhete e limpa no proximo boot.
*/
function limparSessaoSePreciso() {
  if (!fs.existsSync(MARCA_DE_REPAREAR)) return;

  try {
    fs.rmSync(PASTA_DA_SESSAO, { recursive: true, force: true });
    fs.rmSync(MARCA_DE_REPAREAR, { force: true });
    log.alerta("A sessão anterior foi encerrada no celular. Vou pedir o QR de novo.");
  } catch (erro) {
    log.erro(
      `Não consegui limpar a sessão antiga: ${erro.message}. ` +
        `Apague a pasta motor/sessao/whatsapp na mão e rode de novo.`
    );
  }
}

export function criarWhatsApp({ estado, fluxo }) {
  limparSessaoSePreciso();

  const cliente = new Client({
    authStrategy: new LocalAuth({
      clientId: "vez",
      dataPath: path.join(RAIZ, "sessao", "whatsapp"),
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  cliente.on("qr", async (codigo) => {
    // O painel mostra a imagem pronta; o motor nao depende de quem esta olhando.
    const imagem = await QRCode.toDataURL(codigo, {
      margin: 1,
      width: 512,
      color: { dark: "#14110E", light: "#F2EDE4" },
    });

    await estado.anotar({
      estado: "aguardando_qr",
      qr: imagem,
      detalhe: "Abra o painel em Conexão e leia o código pelo WhatsApp do celular.",
    });

    log.destaque("QR pronto. Abra a tela Conexão no painel para escanear.");
  });

  cliente.on("authenticated", async () => {
    await estado.anotar({ estado: "iniciando", qr: null, detalhe: "Pareado, carregando o WhatsApp." });
    log.info("Pareado. Carregando…");
  });

  cliente.on("auth_failure", async (motivo) => {
    await estado.anotar({
      estado: "desligado",
      qr: null,
      detalhe: "O pareamento falhou. Apague motor/sessao/whatsapp e escaneie de novo.",
    });
    log.erro("Pareamento recusado:", motivo);
  });

  cliente.on("ready", async () => {
    const eu = cliente.info?.wid?.user ?? null;

    await estado.anotar({
      estado: "conectado",
      qr: null,
      telefone: eu,
      aparelho: cliente.info?.pushname ?? null,
      detalhe: null,
    });

    log.destaque(`Conectado como ${cliente.info?.pushname ?? eu}. Atendendo.`);
  });

  cliente.on("disconnected", async (motivo) => {
    const foiLogout = String(motivo).toUpperCase().includes("LOGOUT");

    if (foiLogout) {
      // Bilhete pro proximo boot apagar a sessao morta.
      try {
        fs.mkdirSync(path.dirname(MARCA_DE_REPAREAR), { recursive: true });
        fs.writeFileSync(MARCA_DE_REPAREAR, new Date().toISOString());
      } catch {
        // Sem o bilhete o consultor apaga a pasta na mao; a mensagem diz como.
      }
    }

    await estado.anotar({
      estado: "desligado",
      qr: null,
      detalhe: foiLogout
        ? "O aparelho foi desconectado pelo celular, ou a sessão expirou. Ligue o motor de novo e escaneie o QR — ele aparece aqui."
        : `O WhatsApp caiu (${motivo}). Ligue o motor de novo.`,
    });

    log.alerta(
      foiLogout
        ? "Sessão encerrada no celular. Na próxima vez vou pedir o QR de novo."
        : `Desconectado: ${motivo}`
    );
  });

  /*
    `message_create` pega os dois lados. Registrar tambem o que o consultor
    responde pelo celular importa: e desse historico que a Fase 5 aprende
    o jeito de falar dele.
  */
  cliente.on("message_create", async (msg) => {
    try {
      const idDoChat = msg.fromMe ? msg.to : msg.from;
      if (!ehConversaDeCliente(idDoChat) || msg.isStatus) return;

      const texto = textoDaMensagem(msg);
      if (!texto) return;

      const telefone = idDoChat.replace("@c.us", "");

      let nome = null;
      if (!msg.fromMe) {
        const contato = await msg.getContact();
        nome = contato?.name || contato?.pushname || null;
      }

      const conversa = await fluxo.registrar({
        telefone,
        nome,
        texto,
        direcao: msg.fromMe ? "enviada" : "recebida",
      });

      log.info(
        `${msg.fromMe ? "→" : "←"} ${nome ?? telefone}: ${texto.slice(0, 60)}${
          texto.length > 60 ? "…" : ""
        }`
      );

      /*
        So mensagem de cliente aciona o cerebro. O que o consultor manda do
        proprio celular fica gravado (vira material de estilo na Fase 5), mas
        nao dispara classificacao — senao o bot responderia a si mesmo.
      */
      if (msg.fromMe) return;

      /*
        Arquivo do cliente = documentação chegando. Isso nao vai pro
        classificador: foto de contracheque nao tem texto. Vai direto pro
        consultor, no WhatsApp dele, porque e la que ele vive.
      */
      if (msg.hasMedia && ARQUIVOS.has(msg.type) && conversa.atender !== false) {
        await fluxo.marcarDocumentoRecebido(conversa);
        await avisarConsultor(cliente, avisoDeDocumento(conversa));
        log.destaque(`📄 ${nome ?? telefone} mandou documento.`);
        return;
      }

      await fluxo.processarRecebida(conversa, texto, nome);
    } catch (erro) {
      // Uma mensagem que falha nao pode derrubar o atendimento das outras.
      log.erro("Não consegui registrar uma mensagem:", erro.message);
    }
  });

  return cliente;
}
