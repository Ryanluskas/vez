import { gerar as gerarNoOllama, gerarJson as gerarJsonNoOllama } from "./ollama.js";
import { gerarNoGroq, groqConfigurado, modeloDoGroq } from "./groq.js";
import { modeloEmUso as modeloLocal } from "./ollama.js";
import { log } from "./log.js";

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
  ============================================================================
*/

export function ondeCadaCoisaRoda() {
  return {
    pensa: modeloLocal,
    escreve: groqConfigurado ? `${modeloDoGroq} (Groq)` : `${modeloLocal} (local)`,
    temModeloGrande: groqConfigurado,
  };
}

/* Decisão e extração: sempre local. */
export async function pensar({ prompt, sistema }) {
  return gerarJsonNoOllama({ prompt, sistema });
}

/*
  Redação. Tenta o modelo grande; se ele falhar por qualquer motivo — sem
  chave, cota, rede, timeout — cai no local em vez de deixar o cliente sem
  resposta. Degradar é melhor que travar.
*/
export async function escrever({ prompt, sistema, temperatura = 0.4 }) {
  if (groqConfigurado) {
    const texto = await gerarNoGroq({ prompt, sistema, temperatura });
    if (texto) return texto;
    log.alerta("Escrevendo com o modelo local desta vez.");
  }
  return gerarNoOllama({ prompt, sistema, temperatura });
}
