/*
  ============================================================================
  OS MODOS E AS CATEGORIAS LIBERÁVEIS

  Estas duas listas moravam em `acoes-painel.ts`. Não podiam.

  Um arquivo `"use server"` só pode exportar funções async — é a regra do
  React Server Actions, e ela existe por um motivo: todo export daquele
  arquivo vira um endpoint que o navegador pode chamar. Um array exportado
  ali não é um endpoint, e o loader do Next tropeça nele:

    A "use server" file can only export async functions, found object.

  O detalhe perverso é que `next build` COMPILA sem reclamar. O erro só
  aparece quando a página é renderizada de verdade — foi assim que ele
  passou por um build limpo e quebrou o /meu-jeito em runtime.

  Aqui não tem "use server", então são só dados. Server Component e Client
  Component importam do mesmo lugar.
  ============================================================================
*/

/*
  "valor" não está aqui e nunca vai estar. É a última barreira antes do
  envio, depois da regra rígida, do redator e da conferência de números —
  cada camada assume que a anterior falhou.
*/
export const CATEGORIAS_LIBERAVEIS = [
  { chave: "saudacao", nome: "Saudação e agradecimento", exemplo: "“bom dia”, “obrigado”" },
  { chave: "documentos", nome: "Documentos", exemplo: "“quais papéis preciso?”" },
  { chave: "prazo", nome: "Prazos", exemplo: "“quanto tempo demora?”" },
  { chave: "horario", nome: "Horário", exemplo: "“você atende sábado?”" },
  { chave: "acompanhamento", nome: "Acompanhamento e objeção", exemplo: "“e aí, saiu?”, “vou pensar”" },
  { chave: "elegibilidade", nome: "Se pode fazer, qual banco", exemplo: "“você trabalha com INSS?”" },
  { chave: "outro", nome: "Não classificado", exemplo: "o que a IA não soube encaixar" },
] as const;

export const MODOS = [
  {
    chave: "manual",
    nome: "Manual",
    resumo: "Tudo espera sua aprovação em Rascunhos.",
  },
  {
    chave: "assistido",
    nome: "Assistido",
    resumo:
      "Sai sozinho o que foi decidido por regra; o que dependeu de palpite da IA espera você.",
  },
  {
    chave: "autonomo",
    nome: "Autônomo",
    resumo: "Sai sozinho sempre que o assunto estiver liberado abaixo.",
  },
] as const;

export type ChaveDeModo = (typeof MODOS)[number]["chave"];
