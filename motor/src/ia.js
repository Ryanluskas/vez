import { gerar as gerarNoOllama, gerarJson as gerarJsonNoOllama } from "./ollama.js";
import { gerarNoGroq, groqConfigurado, modeloDoGroq } from "./groq.js";
import { modeloEmUso as modeloLocal } from "./ollama.js";
import { disjuntores, saudeDosServicos } from "./resiliencia.js";
import { criarGestorIA } from "./ia/gestor.js";
import { log } from "./log.js";

export const gestorMultiprovedor = criarGestorIA();
export { criarGestorIA };

/*
  ============================================================================
  QUEM PENSA E QUEM ESCREVE

  Dois papéis, dois modelos, e o resto do código não sabe o nome de nenhum
  dos dois — troca por variável de ambiente sem tocar na lógica.

    pensar()   — classificar, extrair fato, decidir. Rápido e barato.
                 Roda LOCAL: essas chamadas veem a mensagem crua do cliente,
                 inclusive quando ela fala de dinheiro.

    escrever() — redigir a mensagem que o cliente lê. Qualidade importa,
                 porque em modo autônomo isso sai sem ninguém ler antes.
                 Usa o modelo grande quando houver; cai no local se não.

  NENHUM DOS DOIS É FONTE DE VERDADE PARA NÚMERO. Valor, parcela, saldo,
  margem, juros e simulação vêm do consultor ou do banco de dados — a IA
  decide COMO responder, nunca QUAL é o dado. Isso é garantido fora daqui,
  em gatilhos.js (corta antes) e numeros.js (confere depois).

  SOBRE CAIR E VOLTAR

  As duas chamadas passam por disjuntor. Enquanto o serviço responde, a
  falha isolada é retentada com espera crescente — pisco de rede não pode
  virar pendência. Depois de quatro fracassos seguidos o disjuntor abre e
  a chamada nem sai: devolve null na hora.

  Isso é melhor do que insistir. Com o Ollama desligado, insistir faria
  cada mensagem esperar três tentativas antes de ir pra fila, e o cliente
  esperaria meio minuto por uma resposta que nunca vem. Com o disjuntor
  aberto, ela vai pra fila na hora e o consultor atende.

  Null aqui NUNCA vira resposta chutada. Vira pendência.
  ============================================================================
*/

export function ondeCadaCoisaRoda() {
  const provedorGemini = gestorMultiprovedor.obterProvedor("gemini");
  let escreve = `${modeloLocal} (local)`;
  let pensa = `${modeloLocal} (local)`;

  if (provedorGemini?.estaConfigurado()) {
    escreve = `Gemini (${provedorGemini.modeloPadrao})`;
  } else if (groqConfigurado) {
    escreve = `${modeloDoGroq} (Groq)`;
  }

  if (groqConfigurado) {
    pensa = `${modeloLocal} (com fallback Groq)`;
  }

  return {
    pensa,
    escreve,
    temModeloGrande: groqConfigurado || Boolean(provedorGemini?.estaConfigurado()),
    saude: saudeDosServicos(),
  };
}

/*
  O Ollama e o Groq devolvem null em vez de estourar — decisão deles, e
  boa. Mas retry e disjuntor precisam enxergar a falha, então aqui o null
  vira exceção por um instante e volta a ser null lá fora.
*/
function exigir(valor, oQue) {
  if (valor === null || valor === undefined) throw new Error(`${oQue} não respondeu`);
  return valor;
}

/*
  Pensar roda LOCAL por padrão, e isso é decisão de produto, não de
  arquitetura: essas chamadas veem a mensagem crua do cliente, inclusive
  quando ela fala de dinheiro, e "as mensagens não saem do seu computador" é
  o que o consultor vende pro cliente dele.

  VEZ_PENSAR_NA_NUVEM=1 abre uma exceção: se o local falhar, o Groq tenta.
  Fica desligado por padrão porque ligar isso é escolher velocidade sobre a
  promessa — e essa escolha é do consultor, não minha.
*/
const pensarNaNuvem = process.env.VEZ_PENSAR_NA_NUVEM === "1";

export async function pensar({ prompt, sistema }) {
  // 1. Tenta o modelo local (Ollama) se o disjuntor estiver normal
  if (disjuntores.ollama.aberto === false) {
    try {
      const r = await disjuntores.ollama.rodar(
        async () => exigir(await gerarJsonNoOllama({ prompt, sistema }), "Ollama"),
        { tentativas: 1 }
      );
      if (r.ok && r.valor) return r.valor;
    } catch {}
  }

  // 2. Se o local não responder, utiliza o Gestor Multiprovedor (Groq / Gemini / Cloud)
  if (gestorMultiprovedor) {
    try {
      const rMulti = await gestorMultiprovedor.pensar({ prompt, sistema });
      if (rMulti) {
        return typeof rMulti === "object" ? rMulti : JSON.parse(rMulti);
      }
    } catch {}
  }

  // 3. Fallback no Groq direto se configurado
  if (groqConfigurado) {
    try {
      const naNuvem = await disjuntores.groq.rodar(
        async () => exigir(await gerarNoGroq({ prompt, sistema, json: true, temperatura: 0.1 }), "Groq"),
        { tentativas: 1 }
      );

      if (naNuvem.ok && naNuvem.valor) {
        return typeof naNuvem.valor === "object" ? naNuvem.valor : JSON.parse(naNuvem.valor);
      }
    } catch {}
  }

  // Null vira pendência segura na fila. Nunca inventa.
  return null;
}

/*
  Redação. Tenta provedores modernos (Gemini/Claude/OpenAI); se não, tenta o
  Groq; se falhar por qualquer motivo — sem chave, cota, rede, timeout,
  disjuntor aberto — cai no local em vez de deixar o cliente sem resposta.
  Degradar é melhor que travar.
*/
export async function escrever({ prompt, sistema, temperatura = 0.7 }) {
  const provedorGemini = gestorMultiprovedor.obterProvedor("gemini");
  const provedorOpenai = gestorMultiprovedor.obterProvedor("openai");
  const provedorClaude = gestorMultiprovedor.obterProvedor("claude");

  if (provedorGemini?.estaConfigurado() || provedorOpenai?.estaConfigurado() || provedorClaude?.estaConfigurado()) {
    const textoGerado = await gestorMultiprovedor.escrever({ prompt, sistema, temperatura });
    if (textoGerado) return textoGerado;
  }

  if (groqConfigurado) {
    const r = await disjuntores.groq.rodar(
      async () => exigir(await gerarNoGroq({ prompt, sistema, temperatura }), "Groq"),
      { tentativas: 2 }
    );

    if (r.ok) return r.valor;
    log.alerta(
      r.aberto
        ? "Groq fora do ar; escrevendo com o modelo local."
        : "Escrevendo com o modelo local desta vez."
    );
  }

  const local = await disjuntores.ollama.rodar(
    async () => exigir(await gerarNoOllama({ prompt, sistema, temperatura }), "Ollama"),
    { tentativas: 1 }
  );

  // Os dois fora: quem chamou manda pra fila. Nunca inventa.
  return local.ok ? local.valor : null;
}
