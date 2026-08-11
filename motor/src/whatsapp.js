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

/*
  Só conversa de pessoa: grupo, status e lista de transmissão ficam de fora.

  @lid é o identificador novo do WhatsApp — ele parou de usar o telefone
  como id da conversa. Nesta conta, 102 das 105 conversas já são @lid e só
  1 continua @c.us. Aceitar só @c.us, como era antes, fazia o bot ignorar
  praticamente TODA mensagem que chegava, em silêncio.
*/
function ehConversaDeCliente(idDoChat) {
  const id = String(idDoChat ?? "");
  return id.endsWith("@c.us") || id.endsWith("@lid");
}

/*
  O telefone de verdade por trás do id. Com @lid ele não está no id, mas o
  contato guarda em `phoneNumber`. Sem isso o consultor veria "13916230930575"
  no lugar do número do cliente dele.
*/
async function telefoneDoContato(msg, idDoChat) {
  try {
    const contato = await msg.getContact();
    const bruto =
      contato?.phoneNumber?._serialized ??
      contato?.phoneNumber ??
      contato?.number ??
      null;

    if (bruto) return String(bruto).replace(/@.*$/, "");
    if (contato?.id?._serialized?.endsWith("@c.us")) return contato.id.user;
  } catch {
    // Contato indisponível: cai pro id.
  }

  // Último recurso: o próprio id, que só vale quando ainda é @c.us.
  const id = String(idDoChat ?? "");
  return id.endsWith("@c.us") ? id.replace("@c.us", "") : id;
}

/* O que conta como "mandou documento". Áudio e figurinha não contam. */
const ARQUIVOS = new Set(["document", "image"]);

/*
  Cada número tem a própria pasta de sessão e o próprio bilhete de reparo.

  O nome é curto de propósito. O Windows corta caminho em 260 caracteres, e
  o Chrome cria arquivos fundos dentro do perfil ("Default/Extension Rules/
  ..."). Com o UUID inteiro duas vezes — na pasta e no clientId — o caminho
  já nascia com ~140 caracteres e o perfil quebrava pela metade. O sintoma
  era "Execution context was destroyed", que não diz nada sobre caminho.
*/
export function apelidoCurto(idConexao) {
  return String(idConexao).replace(/-/g, "").slice(0, 8);
}

export function pastaDaSessao(idConexao) {
  return path.join(RAIZ, "sessao", "wa", apelidoCurto(idConexao));
}

function marcaDeReparear(idConexao) {
  return path.join(RAIZ, "sessao", `refazer-${idConexao}`);
}

export function pedirNovoPareamento(idConexao) {
  try {
    fs.mkdirSync(path.join(RAIZ, "sessao"), { recursive: true });
    fs.writeFileSync(marcaDeReparear(idConexao), new Date().toISOString());
  } catch {
    // Sem o bilhete o consultor apaga a pasta na mao; a mensagem diz como.
  }
}

/*
  Quando o WhatsApp desconecta com LOGOUT — o consultor removeu o aparelho
  pelo celular, ou a sessao expirou — as credenciais gravadas viram lixo.
  Reaproveitar elas faz o motor tentar autenticar com uma sessao morta em
  vez de mostrar QR novo, e ele fica preso nisso.

  Nao da pra apagar na hora do LOGOUT: o navegador ainda esta com os
  arquivos abertos. Entao deixa um bilhete e limpa no proximo boot.
*/
function limparSessaoSePreciso(idConexao, apelido) {
  const bilhete = marcaDeReparear(idConexao);
  if (!fs.existsSync(bilhete)) return;

  try {
    fs.rmSync(pastaDaSessao(idConexao), { recursive: true, force: true });
    fs.rmSync(bilhete, { force: true });
    log.alerta(`[${apelido}] sessão anterior encerrada. Vou pedir o QR de novo.`);
  } catch (erro) {
    log.erro(
      `[${apelido}] não consegui limpar a sessão antiga: ${erro.message}. ` +
        `Apague ${pastaDaSessao(idConexao)} na mão.`
    );
  }
}

/*
  Um cliente de WhatsApp para UM número. O motor cria um destes por linha
  ativa em `conexoes` — cada um com sua sessão, seu Chromium e seu estado.
*/
export function criarWhatsApp({ conexao, estado, fluxo }) {
  const apelido = conexao.apelido ?? "Principal";
  limparSessaoSePreciso(conexao.id, apelido);

  const cliente = new Client({
    authStrategy: new LocalAuth({
      clientId: apelidoCurto(conexao.id),
      dataPath: pastaDaSessao(conexao.id),
    }),
    /*
      Nao mexer no userAgent aqui. A lib ja troca o dela por um Chrome
      normal antes de abrir a pagina — sem isso o WhatsApp ve
      "HeadlessChrome" e devolve "atualize o Google Chrome" em vez do QR.
      Sobrescrever essa troca foi testado e nao ajudou.
    */
    puppeteer: {
      headless: true,
      /*
        Esta lista e exatamente a que passou no teste isolado. Cada arg a
        mais aqui ja custou horas de "Execution context was destroyed" —
        nao acrescente nada sem testar o cliente sozinho antes.
      */
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
    /*
      Escape hatch: quando o WhatsApp Web muda e quebra a lib, da pra
      prender numa versao conhecida sem esperar release.
      WA_VERSAO_HTML=https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.xxxxx.html
    */
    ...(process.env.WA_VERSAO_HTML
      ? {
          webVersionCache: {
            type: "remote",
            remotePath: process.env.WA_VERSAO_HTML,
          },
        }
      : {}),
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
      detalhe: `Abra o painel em Conexão e leia o código de "${apelido}" pelo celular.`,
    });

    log.destaque(`[${apelido}] QR pronto. Abra a tela Conexão no painel.`);
  });

  cliente.on("authenticated", async () => {
    await estado.anotar({
      estado: "iniciando",
      qr: null,
      detalhe: "Pareado, carregando o WhatsApp.",
    });
    log.info(`[${apelido}] pareado. Carregando…`);
  });

  cliente.on("auth_failure", async (motivo) => {
    pedirNovoPareamento(conexao.id);
    await estado.anotar({
      estado: "desligado",
      qr: null,
      detalhe: "O pareamento falhou. Ligue o motor de novo e escaneie um QR novo.",
    });
    log.erro(`[${apelido}] pareamento recusado:`, motivo);
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
    log.destaque(`[${apelido}] conectado como ${cliente.info?.pushname ?? eu}. Atendendo.`);
  });

  cliente.on("disconnected", async (motivo) => {
    const foiLogout = String(motivo).toUpperCase().includes("LOGOUT");
    if (foiLogout) pedirNovoPareamento(conexao.id);

    await estado.anotar({
      estado: "desligado",
      qr: null,
      detalhe: foiLogout
        ? "O aparelho foi desconectado pelo celular, ou a sessão expirou. Ligue o motor de novo e escaneie o QR — ele aparece aqui."
        : `O WhatsApp caiu (${motivo}). Ligue o motor de novo.`,
    });

    log.alerta(
      foiLogout
        ? `[${apelido}] sessão encerrada no celular. Vou pedir o QR na próxima vez.`
        : `[${apelido}] desconectado: ${motivo}`
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

      const telefone = await telefoneDoContato(msg, idDoChat);

      let nome = null;
      if (!msg.fromMe) {
        const contato = await msg.getContact();
        // Com @lid, `name` vem como "+55 96 9907-2152" pra quem não está
        // salvo. Isso é o telefone formatado, não um nome — não serve.
        const bruto = contato?.name || contato?.pushname || null;
        nome = bruto && !/^\+?[\d\s()-]+$/.test(bruto) ? bruto : null;
      }

      const conversa = await fluxo.registrar({
        idConexao: conexao.id,
        idChat: idDoChat,
        telefone,
        nome,
        texto,
        direcao: msg.fromMe ? "enviada" : "recebida",
      });

      log.info(
        `[${apelido}] ${msg.fromMe ? "→" : "←"} ${nome ?? telefone}: ${texto.slice(0, 55)}${
          texto.length > 55 ? "…" : ""
        }`
      );

      /*
        So mensagem de cliente aciona o cerebro. O que o consultor manda do
        proprio celular fica gravado, mas nao dispara classificacao — senao
        o bot responderia a si mesmo.
      */
      if (msg.fromMe) return;

      /*
        Arquivo do cliente = documentação chegando. Isso nao vai pro
        classificador: foto de contracheque nao tem texto. Vai direto pro
        consultor, no WhatsApp dele, porque e la que ele vive.
      */
      if (msg.hasMedia && ARQUIVOS.has(msg.type) && conversa.atender !== false) {
        await fluxo.marcarDocumentoRecebido(conversa);
        await avisarConsultor(cliente, `${avisoDeDocumento(conversa)} (${apelido})`);
        log.destaque(`[${apelido}] 📄 ${nome ?? telefone} mandou documento.`);
        return;
      }

      await fluxo.processarRecebida(conversa, texto, nome);
    } catch (erro) {
      // Uma mensagem que falha nao pode derrubar o atendimento das outras.
      log.erro(`[${apelido}] não consegui registrar uma mensagem: ${erro.message}`);
    }
  });

  return cliente;
}

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
