import { log } from "./log.js";

/*
  ============================================================================
  QUANDO ALGO CAI

  O motor roda na máquina do consultor, o dia inteiro, sem ninguém olhando.
  Nesse regime tudo cai em algum momento: o Wi-Fi pisca, o Supabase de
  graça hiberna, o Ollama some quando a máquina dorme, o Chrome do WhatsApp
  trava, o Groq devolve 429.

  Duas peças, e elas resolvem problemas opostos:

    tentar()   — a falha é passageira. Tenta de novo, esperando cada vez
                 mais. Resolve o pisco de rede.

    disjuntor()— a falha NÃO é passageira. Depois de N fracassos seguidos
                 ele abre e para de tentar por um tempo. Resolve o caso em
                 que insistir é pior que desistir: sem ele, o Ollama
                 desligado faria cada mensagem esperar 3 tentativas × 8s
                 antes de ir pra fila, e o cliente esperaria meio minuto
                 por uma resposta que nunca vem.

  O QUE NENHUMA DAS DUAS FAZ: inventar resposta. Falha esgotada vira
  pendência pro consultor. Um bot que chuta quando o banco está fora é
  pior que um bot parado — o parado ninguém percebe, o que chuta manda um
  número errado para um cliente.
  ============================================================================
*/

const ESPERA_INICIAL_MS = 400;
const FATOR = 3;
const TETO_MS = 10_000;

export const TENTATIVAS_PADRAO = 3;

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/*
  Espera crescente com um tiquinho de aleatório. O aleatório importa
  quando várias mensagens falham juntas: sem ele, todas tentariam de novo
  no mesmo milissegundo e derrubariam o serviço que está voltando.
*/
function espera(tentativa) {
  const base = Math.min(ESPERA_INICIAL_MS * FATOR ** tentativa, TETO_MS);
  return base + Math.random() * (base / 4);
}

/*
  Roda `acao` até dar certo ou acabar as tentativas.

  `ehPassageiro` decide o que merece nova tentativa. O padrão é otimista,
  mas erro de programação (TypeError) e erro de regra de negócio não são
  passageiros: repetir só gasta o tempo do cliente.
*/
export function ehPassageiro(erro) {
  if (!erro) return false;
  if (erro instanceof TypeError || erro instanceof ReferenceError) return false;

  const m = String(erro.message ?? erro).toLowerCase();

  /*
    Limite de uso NÃO se resolve tentando de novo no mesmo segundo.

    Medido: o Groq devolve 429 quando o teto de tokens por minuto estoura,
    e a retentativa imediata levava outro 429 — duas chamadas queimadas pra
    chegar no mesmo lugar, com o cliente esperando as duas.

    O caminho certo já existe e é o de baixo: cai pro modelo local. Insistir
    no serviço que acabou de dizer "você passou do limite" só atrasa isso.
  */
  if (/\b429\b|rate limit|limite de uso|too many requests|quota/.test(m)) return false;

  // Erros de rede, tempo e indisponibilidade. Estes voltam.
  if (/econnrefused|econnreset|etimedout|enotfound|enetunreach|socket hang up/.test(m)) return true;
  if (/timeout|tempo|hibern|temporar|unavailable|indispon/.test(m)) return true;
  if (/\b(?:500|502|503|504)\b/.test(m)) return true;
  if (/fetch failed|network|rede/.test(m)) return true;

  // Autenticação, permissão e "não existe" não melhoram tentando de novo.
  if (/\b(?:400|401|403|404|422)\b|unauthorized|forbidden|not found/.test(m)) return false;

  return true;
}

export async function tentar(acao, opcoes = {}) {
  const {
    nome = "operação",
    tentativas = TENTATIVAS_PADRAO,
    passageiro = ehPassageiro,
    aoFalhar = null,
    silencioso = false,
  } = opcoes;

  let ultimoErro = null;

  for (let i = 0; i < tentativas; i++) {
    try {
      return { ok: true, valor: await acao(i) };
    } catch (erro) {
      ultimoErro = erro;

      if (!passageiro(erro)) {
        if (!silencioso) log.erro(`${nome}: ${erro.message} (não adianta tentar de novo)`);
        break;
      }

      const ultima = i === tentativas - 1;
      if (ultima) break;

      const ms = espera(i);
      if (!silencioso) {
        log.alerta(`${nome} falhou (${erro.message}). Tentando de novo em ${Math.round(ms / 1000)}s…`);
      }
      await dormir(ms);
    }
  }

  if (!silencioso) {
    log.erro(`${nome}: desisti depois de ${tentativas} tentativas — ${ultimoErro?.message}`);
  }

  /*
    Não estoura. Quem chamou precisa poder decidir o plano B, e plano B
    aqui é sempre o mesmo: o consultor entra. Exceção subindo faria a
    mensagem do cliente sumir sem ninguém saber.
  */
  await aoFalhar?.(ultimoErro);
  return { ok: false, erro: ultimoErro?.message ?? "falhou" };
}

/* ------------------------------------------------------------------
   Disjuntor
------------------------------------------------------------------ */

const FALHAS_PARA_ABRIR = 4;
const DESCANSO_MS = 60_000;

/*
  Um por serviço externo. Enquanto aberto, a chamada nem sai — devolve
  `{ok:false, aberto:true}` na hora, e o agente já sabe que precisa chamar
  gente em vez de esperar.
*/
export function disjuntor(nome, { falhasParaAbrir = FALHAS_PARA_ABRIR, descansoMs = DESCANSO_MS } = {}) {
  let falhasSeguidas = 0;
  let abertoAte = 0;
  let jaAvisou = false;

  return {
    get aberto() {
      return Date.now() < abertoAte;
    },

    get estado() {
      if (Date.now() < abertoAte) return "aberto";
      return falhasSeguidas > 0 ? "instavel" : "ok";
    },

    /* Passou. Zera tudo — inclusive o aviso, pra voltar a avisar se cair de novo. */
    acertou() {
      if (falhasSeguidas > 0 || jaAvisou) {
        log.info(`${nome} voltou.`);
      }
      falhasSeguidas = 0;
      abertoAte = 0;
      jaAvisou = false;
    },

    errou() {
      falhasSeguidas++;
      if (falhasSeguidas >= falhasParaAbrir && Date.now() >= abertoAte) {
        abertoAte = Date.now() + descansoMs;
        log.erro(
          `${nome} falhou ${falhasSeguidas}x seguidas. Parei de tentar por ${descansoMs / 1000}s.`
        );
        jaAvisou = true;
        return { abriu: true };
      }
      return { abriu: false };
    },

    /*
      Envolve uma chamada. É o formato que o resto do motor usa: nunca
      estoura, e diz na resposta se foi bloqueado pelo disjuntor.
    */
    async rodar(acao, opcoes = {}) {
      if (this.aberto) {
        const faltam = Math.ceil((abertoAte - Date.now()) / 1000);
        return { ok: false, aberto: true, erro: `${nome} fora do ar (tento de novo em ${faltam}s)` };
      }

      const r = await tentar(acao, { nome, ...opcoes });
      if (r.ok) this.acertou();
      else this.errou();
      return r;
    },
  };
}

/*
  Os disjuntores do produto. Um por dependência externa, criados uma vez e
  compartilhados: o estado só serve se for o mesmo para todas as mensagens.
*/
export const disjuntores = {
  ollama: disjuntor("Ollama"),
  groq: disjuntor("Groq"),
  supabase: disjuntor("Supabase", { falhasParaAbrir: 6, descansoMs: 30_000 }),
};

/* Como o painel e o log veem a saúde do motor num relance. */
export function saudeDosServicos() {
  return Object.fromEntries(
    Object.entries(disjuntores).map(([nome, d]) => [nome, d.estado])
  );
}
