/*
  ============================================================================
  TABELA DE CUSTOS ESTIMADOS POR PROVEDOR E MODELO (USD por 1M tokens)

  Utilizado para estimar custos operacionais por conversa e por consultor
  na tabela `consumo_ia`.
  ============================================================================
*/

export const TABELA_DE_CUSTOS = {
  // Google Gemini
  "gemini-3.5-flash-lite": { entrada: 0.0375, saida: 0.15 },
  "gemini-3.5-flash": { entrada: 0.075, saida: 0.30 },
  "gemini-3.8-flash": { entrada: 0.075, saida: 0.30 },
  "gemini-2.5-flash": { entrada: 0.075, saida: 0.30 },
  "gemini-2.5-flash-lite": { entrada: 0.0375, saida: 0.15 },
  "gemini-1.5-flash": { entrada: 0.075, saida: 0.30 },
  "gemini-1.5-pro": { entrada: 1.25, saida: 5.00 },

  // OpenAI
  "gpt-4o-mini": { entrada: 0.15, saida: 0.60 },
  "gpt-4o": { entrada: 2.50, saida: 10.00 },

  // Anthropic Claude
  "claude-3-5-haiku-20241022": { entrada: 0.80, saida: 4.00 },
  "claude-3-5-sonnet-20241022": { entrada: 3.00, saida: 15.00 },

  // Groq
  "llama-3.3-70b-versatile": { entrada: 0.59, saida: 0.79 },
  "llama-3.1-8b-instant": { entrada: 0.05, saida: 0.08 },
  "openai/gpt-oss-120b": { entrada: 0.80, saida: 1.20 },

  // Modelos locais (Ollama)
  "llama3.2:3b": { entrada: 0.0, saida: 0.0 },
  "llama3.2:1b": { entrada: 0.0, saida: 0.0 },
  local: { entrada: 0.0, saida: 0.0 },
};

export function calcularCustoEstimado({ modelo, tokensEntrada = 0, tokensSaida = 0 }) {
  if (!modelo) return 0;

  // Busca correspondência exata ou por prefixo
  let config = TABELA_DE_CUSTOS[modelo];
  if (!config) {
    const chave = Object.keys(TABELA_DE_CUSTOS).find((k) =>
      modelo.toLowerCase().includes(k.toLowerCase())
    );
    config = chave ? TABELA_DE_CUSTOS[chave] : { entrada: 0.1, saida: 0.3 };
  }

  const custoEntrada = (tokensEntrada / 1_000_000) * config.entrada;
  const custoSaida = (tokensSaida / 1_000_000) * config.saida;

  return Number((custoEntrada + custoSaida).toFixed(6));
}
