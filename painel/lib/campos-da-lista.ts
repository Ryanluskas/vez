/*
  Os campos que o bot pode falar a partir de uma lista.

  Este arquivo é o par de `motor/src/lista.js`. São dois pacotes separados —
  o painel roda na Vercel, o motor na máquina do consultor — então a mesma
  tabela mora nos dois lados. Mexeu aqui, mexe lá.

  A chave é o que vai pro banco (`preferencias.campos_da_lista`); o rótulo é
  o que o consultor lê.
*/

export type CampoDaLista = {
  chave: string;
  rotulo: string;
  ajuda: string;
  /* A porcentagem incide só neste. */
  aplicaPorcentagem?: boolean;
};

export const CAMPOS_DA_LISTA: CampoDaLista[] = [
  {
    chave: "reducao_total",
    rotulo: "Redução total",
    ajuda: "Quanto o cliente economiza no total. É sobre este que a porcentagem incide.",
    aplicaPorcentagem: true,
  },
  {
    chave: "margem_livre",
    rotulo: "Margem livre",
    ajuda: "Quanto sobra da margem consignável.",
  },
  {
    chave: "saldo_devedor",
    rotulo: "Saldo devedor",
    ajuda: "Quanto ele ainda deve, somando os contratos.",
  },
  {
    chave: "soma_parcelas",
    rotulo: "Soma das parcelas",
    ajuda: "Quanto ele paga por mês hoje, somando tudo.",
  },
  {
    chave: "total_parcelas",
    rotulo: "Total de parcelas",
    ajuda: "Quantas parcelas ao todo.",
  },
  {
    chave: "contratos",
    rotulo: "Contratos",
    ajuda: "Cada contrato com taxa, valor da parcela e quantas já pagou.",
  },
];

/*
  Os cabeçalhos que o importador procura na planilha. Coluna que não estiver
  aqui é guardada mesmo assim (o `dados` recebe a linha inteira), mas não
  vira campo que o bot fala.
*/
export const COLUNAS_ESPERADAS = [
  "Nome",
  "CPF",
  "DDD",
  "Celular",
  "Margem_Livre",
  "Soma_Parcelas",
  "Total_Parcelas",
  "Saldo_Devedor_Total",
  "Reducao_Total",
];

export type Lista = {
  id: string;
  nome: string;
  arquivo: string | null;
  linhas: number;
  ativa: boolean;
  criado_em: string;
};
