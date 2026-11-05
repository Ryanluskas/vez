import fs from "node:fs";
import path from "node:path";
import { log } from "../log.js";

/*
  ============================================================================
  INTEGRAÇÃO BOTZAPZAP <-> VEZ
  
  Módulo de ponte desacoplada que lê registros de campanhas, destinatários
  e dados enriquecidos originados pelo Botzapzap.
  
  Estrutura lida:
  - contatos_enviados.json: dicionário de números enviados, modo/campanha e timestamp
  - contatos_dados.json: dados enriquecidos (nome, cpf, margem/lib, valor, faixa, etc.)
  - historico_envios.txt: log sequencial de disparos
  ============================================================================
*/

const CAMINHO_PADRAO_BOTZAPZAP = "d:\\01_Projetos\\Programacao\\Bots_Automacoes\\whatsapp-bot-master";

// Cache em memória com verificação de timestamp de modificação (mtime)
let cacheEnviados = null;
let mtimeEnviados = 0;
let cacheDados = null;
let mtimeDados = 0;

/**
 * Normaliza número para comparação de dígitos limpos.
 * Suporta sufixo de 8 dígitos para cobrir variações de DDI (+55), DDD e 9º dígito.
 */
export function normalizarTelefone(numero) {
  if (!numero) return "";
  const digitos = String(numero).replace(/\D/g, "");
  return digitos;
}

/**
 * Extrai os 8 dígitos finais para garantir match confiável mesmo com divergências
 * de DDI/DDD/9º dígito no WhatsApp Web.
 */
export function extrairSufixo8(numero) {
  const limpo = normalizarTelefone(numero);
  if (limpo.length < 8) return limpo;
  return limpo.slice(-8);
}

/**
 * Retorna o diretório base configurado para o Botzapzap.
 */
export function obterDiretorioBotzapzap() {
  return process.env.BOTZAPZAP_DIR || CAMINHO_PADRAO_BOTZAPZAP;
}

/**
 * Carrega com segurança o arquivo contatos_enviados.json com cache inteligente.
 */
export function carregarContatosEnviados(diretorioBase = obterDiretorioBotzapzap()) {
  const caminho = path.join(diretorioBase, "contatos_enviados.json");
  if (!fs.existsSync(caminho)) {
    return { numbers: {}, falhas: {} };
  }

  try {
    const stats = fs.statSync(caminho);
    if (cacheEnviados && stats.mtimeMs === mtimeEnviados) {
      return cacheEnviados;
    }

    const conteudo = fs.readFileSync(caminho, "utf8");
    const json = JSON.parse(conteudo);
    cacheEnviados = json && typeof json.numbers === "object" ? json : { numbers: {} };
    mtimeEnviados = stats.mtimeMs;
    return cacheEnviados;
  } catch (erro) {
    log.alerta(`[Botzapzap] Erro ao ler contatos_enviados.json: ${erro.message}`);
    return cacheEnviados || { numbers: {} };
  }
}

/**
 * Carrega com segurança o arquivo contatos_dados.json com cache inteligente.
 */
export function carregarContatosDados(diretorioBase = obterDiretorioBotzapzap()) {
  const caminho = path.join(diretorioBase, "contatos_dados.json");
  if (!fs.existsSync(caminho)) {
    return {};
  }

  try {
    const stats = fs.statSync(caminho);
    if (cacheDados && stats.mtimeMs === mtimeDados) {
      return cacheDados;
    }

    const conteudo = fs.readFileSync(caminho, "utf8");
    const json = JSON.parse(conteudo);
    cacheDados = json && typeof json === "object" ? json : {};
    mtimeDados = stats.mtimeMs;
    return cacheDados;
  } catch (erro) {
    log.alerta(`[Botzapzap] Erro ao ler contatos_dados.json: ${erro.message}`);
    return cacheDados || {};
  }
}

/**
 * Invalida cache manualmente (útil para testes unitários ou recarga forçada).
 */
export function limparCacheIntegracao() {
  cacheEnviados = null;
  mtimeEnviados = 0;
  cacheDados = null;
  mtimeDados = 0;
}

/**
 * Extrai DDI, DDD e sufixo de 8 dígitos para comparação segura sem colisão entre DDDs distintos.
 */
export function decomporTelefone(numero) {
  const limpo = normalizarTelefone(numero);
  const semDdi = limpo.startsWith("55") && limpo.length >= 12 ? limpo.slice(2) : limpo;
  const ddd = semDdi.length >= 10 ? semDdi.slice(0, 2) : null;
  const sufixo8 = semDdi.length >= 8 ? semDdi.slice(-8) : semDdi;
  return { limpo, semDdi, ddd, sufixo8 };
}

function selecionarRegistroSemColisao(mapa, telBuscado) {
  if (!mapa || typeof mapa !== "object") return { registro: null, chave: null, colisao: false };

  const alvo = decomporTelefone(telBuscado);
  const candidatosExatos = [];
  const candidatosMesmoDdd = [];
  const candidatosSemDdd = [];
  let houveDivergenciaDdd = false;

  for (const [chave, info] of Object.entries(mapa)) {
    const item = decomporTelefone(chave);
    if (!item.sufixo8 || item.sufixo8 !== alvo.sufixo8) continue;

    if (item.semDdi === alvo.semDdi || item.limpo === alvo.limpo) {
      candidatosExatos.push({ chave, info });
      continue;
    }

    if (alvo.ddd && item.ddd) {
      if (alvo.ddd === item.ddd) {
        candidatosMesmoDdd.push({ chave, info });
      } else {
        houveDivergenciaDdd = true;
      }
      continue;
    }

    candidatosSemDdd.push({ chave, info });
  }

  if (candidatosExatos.length === 1) {
    return { registro: candidatosExatos[0].info, chave: candidatosExatos[0].chave, colisao: false };
  }
  if (candidatosExatos.length > 1) {
    return { registro: null, chave: null, colisao: true };
  }

  if (candidatosMesmoDdd.length === 1) {
    return { registro: candidatosMesmoDdd[0].info, chave: candidatosMesmoDdd[0].chave, colisao: false };
  }
  if (candidatosMesmoDdd.length > 1) {
    return { registro: null, chave: null, colisao: true };
  }

  if (candidatosSemDdd.length === 1 && !houveDivergenciaDdd) {
    return { registro: candidatosSemDdd[0].info, chave: candidatosSemDdd[0].chave, colisao: false };
  }
  if (candidatosSemDdd.length > 1 || houveDivergenciaDdd) {
    return { registro: null, chave: null, colisao: true };
  }

  return { registro: null, chave: null, colisao: false };
}

/**
 * Busca o contexto de campanha para um telefone específico.
 * 
 * @param {string} telefone - Número de telefone do contato que enviou mensagem
 * @param {string} [diretorioBase] - Caminho opcional do diretório do Botzapzap
 * @returns {object} Objeto com dados da campanha e do cliente
 */
export function buscarContextoCampanha(telefone, diretorioBase = obterDiretorioBotzapzap()) {
  if (!telefone) {
    return { pertenceCampanha: false, motivo: "telefone_vazio" };
  }

  const sufixoBuscado = extrairSufixo8(telefone);
  if (!sufixoBuscado || sufixoBuscado.length < 8) {
    return { pertenceCampanha: false, motivo: "telefone_invalido" };
  }

  const enviados = carregarContatosEnviados(diretorioBase);
  const dadosBase = carregarContatosDados(diretorioBase);

  const numbers = enviados.numbers || {};
  const buscaEnvio = selecionarRegistroSemColisao(numbers, telefone);
  const buscaDados = selecionarRegistroSemColisao(dadosBase, telefone);

  if (buscaEnvio.colisao || buscaDados.colisao) {
    log.alerta(`[Botzapzap] Colisão ou divergência de DDD detectada para sufixo ${sufixoBuscado}; associação automática bloqueada.`);
    return {
      pertenceCampanha: false,
      telefone,
      sufixo: sufixoBuscado,
      motivo: "colisao_ambigua_ou_ddd_divergente",
    };
  }

  const registroEnvio = buscaEnvio.registro;
  const chaveEncontrada = buscaEnvio.chave;
  const registroDados = buscaDados.registro;

  if (!registroEnvio && !registroDados) {
    return {
      pertenceCampanha: false,
      telefone,
      sufixo: sufixoBuscado,
      motivo: "nao_encontrado_na_campanha",
    };
  }

  // Identificação e dados consolidados
  const campanhaModo = registroEnvio?.modo || registroDados?.origem || "Campanha Botzapzap";
  const disparadoEm = registroEnvio?.ultimo_envio || registroDados?.importado_em || null;
  const identificacao = registroEnvio?.identificacao || registroDados?.nome || "";

  return {
    pertenceCampanha: true,
    telefone,
    telefoneCampanha: chaveEncontrada || registroDados?.telefone || telefone,
    campanha: {
      id: campanhaModo,
      nome: campanhaModo,
      modo: registroEnvio?.modo || null,
      disparadoEm,
      origemPlanilha: registroDados?.origem || null,
    },
    cliente: {
      nome: registroDados?.nome || identificacao,
      primeiroNome: registroDados?.primeiro_nome || (identificacao ? identificacao.split(" ")[0] : null),
      cpf: registroDados?.cpf || null,
      uf: registroDados?.uf || null,
      estado: registroDados?.estado || null,
      cidade: registroDados?.cidade || null,
      faixa: registroDados?.faixa || null,
      // Valores pré-calculados vindos da planilha original
      liberacaoEstimada: registroDados?.lib ?? null,
      valorBase: registroDados?.valor ?? null,
      valorFmt: registroDados?.valor_fmt ?? null,
    },
  };
}

/**
 * Verifica se um telefone pertence a alguma campanha recente do Botzapzap.
 */
export function contatoPertenceACampanha(telefone, diretorioBase = obterDiretorioBotzapzap()) {
  const contexto = buscarContextoCampanha(telefone, diretorioBase);
  return Boolean(contexto && contexto.pertenceCampanha);
}

/**
 * Retorna resumo das últimas campanhas e totais de envios.
 */
export function obterRelatorioCampanhas(diretorioBase = obterDiretorioBotzapzap()) {
  const enviados = carregarContatosEnviados(diretorioBase);
  const dadosBase = carregarContatosDados(diretorioBase);

  const totalEnviados = Object.keys(enviados.numbers || {}).length;
  const totalBase = Object.keys(dadosBase || {}).length;

  const contagemModos = {};
  for (const info of Object.values(enviados.numbers || {})) {
    const modo = info.modo || "desconhecido";
    contagemModos[modo] = (contagemModos[modo] || 0) + 1;
  }

  return {
    diretorio: diretorioBase,
    totalDestinatariosEnviados: totalEnviados,
    totalBaseCadastrada: totalBase,
    campanhasPorModo: contagemModos,
  };
}
