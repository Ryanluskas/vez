/*
  ============================================================================
  A REGRA DE OURO DO PRODUTO

  Dinheiro nunca passa pela IA. Ponto.

  Este arquivo roda ANTES do classificador e por cima dele. Ele so sabe fazer
  uma coisa: FORCAR precisa_do_ryan = true. Nao existe caminho aqui que devolva
  false, que libere uma conversa, nem que a IA consiga desligar.

  Isso e de proposito. Um classificador de 3 bilhoes de parametros errando um
  "quanto cai na minha conta?" custa a credibilidade do consultor com o cliente
  dele. Uma lista de regex boba, que erra pro lado seguro, nao custa nada:
  no pior caso o consultor responde uma pergunta que o bot daria conta.

  Se voce for editar este arquivo, a unica pergunta que importa e:
  "isso pode fazer o bot responder um numero sozinho?" Se puder, nao entra.
  ============================================================================
*/

/* Tira acento e caixa, pra "PARCELA", "parcéla" e "parcela" caírem no mesmo lugar. */
function normalizar(texto) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/*
  Cada gatilho tem um motivo legivel: e ele que aparece no painel explicando
  por que aquela conversa congelou. O consultor merece saber.
*/
/*
  "quanto" sozinho nao trava (existe "quanto tempo demora"), e o verbo sozinho
  tambem nao. O que trava e a dupla — e ela aparece nas duas ordens, porque o
  cliente escreve tanto "quanto da pra pegar" quanto "da pra pegar quanto".
  Foi exatamente essa segunda forma que passou batido no primeiro teste.
*/
/*
  As unicas excecoes seguras sao unidades de TEMPO: "quanto tempo demora",
  "em quantos dias cai". Sao perguntas de prazo, e a resposta ("1 a 2 dias
  uteis") nao tem cifra nenhuma.

  "dias" e "horas" entraram depois: "em quantos dias cai?" casava com
  quanto+cai e ia pra Fila. Ir pra Fila e o lado seguro do erro, mas era
  erro — o cliente perguntava prazo e recebia pedido de documento.

  NAO entram aqui: meses, parcelas, vezes. "Em quantos meses fica" e
  pergunta de prazo de CONTRATO, que e dinheiro.

  Fora dessas, todo "quanto" perto de verbo de dinheiro trava.
*/
const UNIDADE_DE_TEMPO = "(?:tempo|dias?|horas?)";
const QUANTO = `(?:quanto|quantos|quanta|qnt|qto)(?!\\s+${UNIDADE_DE_TEMPO}\\b)`;
/*
  As conjugacoes estao escritas uma a uma, e isso tem custo: "pega" e "pegar"
  estavam aqui, "pego" nao — e "quanto eu pego?" passava batido pela regra de
  ouro. Achado por teste, nao em producao, mas era exatamente o buraco que
  faria o bot responder sozinho a pergunta mais cara do produto.

  A primeira pessoa e a forma que o cliente mais usa: ele fala de si. Toda
  vez que entrar um verbo aqui, entra tambem o "eu" dele.
*/
const VERBO_DE_DINHEIRO =
  "(?:libera|liberar|liberacao|consigo|conseguir|consegue|posso|da pra|" +
  "pega|pegar|pego|" +
  "tira|tirar|tiro|" +
  "saca|sacar|saco|" +
  "leva|levar|levo|" +
  "ganha|ganhar|ganho|" +
  "resgata|resgatar|resgato|" +
  "sai|vem|cai|cair|recebo|receber|fica|ficaria|rende|sobra|resta|" +
  "empresta|emprestar|entra|entrar)";

const GATILHOS = [
  {
    motivo: "perguntou quanto libera",
    padrao: new RegExp(`\\b${QUANTO}\\b[^?.!]{0,40}\\b${VERBO_DE_DINHEIRO}\\b`),
  },
  {
    motivo: "perguntou quanto libera",
    padrao: new RegExp(`\\b${VERBO_DE_DINHEIRO}\\b[^?.!]{0,40}\\b${QUANTO}\\b`),
  },
  {
    /*
      "Liberar" sozinho, sem "quanto" por perto.

      Achado na conversa do Ademar: ele escreveu "Preciso saber se ainda
      libera pra mim" e o gatilho nao pegou — o padrao exigia "quanto"
      colado no verbo. Mas "ainda libera?", "da pra liberar?", "foi
      liberado?" sao todas a MESMA pergunta, e nenhuma tem "quanto".

      Neste ramo "liberar" so tem um significado: dinheiro saindo pro
      cliente. Nao existe uso inocente dentro de uma conversa de
      consignado — e um verbo que so quer dizer dinheiro merece gatilho
      proprio.
    */
    motivo: "perguntou se libera",
    padrao: /\b(libera|liberam|liberar|liberou|liberado|liberada|liberacao)\b/,
  },
  {
    motivo: "falou em valor",
    padrao: /\b(valor|valores|quantia|montante)\b/,
  },
  {
    motivo: "falou em parcela",
    padrao: /\b(parcela|parcelas|parcelamento|prestacao|prestacoes|presta)\b/,
  },
  {
    motivo: "pediu simulacao",
    padrao: /\b(simula|simular|simulacao|simulaco|calcula|calcular|calculo)\b/,
  },
  {
    motivo: "perguntou saldo ou margem",
    padrao: /\b(saldo|margem|margem consignavel|limite|disponivel)\b/,
  },
  {
    motivo: "falou em juros ou taxa",
    padrao: /\b(juros|jurus|taxa|taxas|cet|percentual|porcentagem)\b/,
  },
  {
    motivo: "falou em refinanciamento ou troco",
    padrao: /\b(refin|refinanciamento|refinanciar|troco|portabilidade|portar)\b/,
  },
  {
    motivo: "perguntou prazo de pagamento",
    /*
      "Em quantas" foi escrito pra pegar "em quantas parcelas" e "em
      quantas vezes" — prazo de CONTRATO, que é dinheiro. Ele pegava
      junto "em quantas horas entra?", que é prazo de ENTREGA e não tem
      cifra nenhuma. O lookahead separa os dois.
    */
    padrao: /\b(quantas vezes|em quantas(?!\s+(?:horas?|semanas?))|prazo|meses|parcelado em|x de)\b/,
  },
  {
    motivo: "citou um valor em reais",
    padrao: /(r\$|\breais\b|\bmil\b|\bcontos\b)/,
  },
  {
    motivo: "citou um numero grande",
    // 4 digitos ou mais, ou numero formatado tipo 1.500 / 2.300,00.
    // Telefone e CPF ja foram descartados antes de chegar aqui.
    padrao: /\b\d{1,3}(\.\d{3})+(,\d{2})?\b|\b\d{4,}\b/,
  },
];

/*
  Devolve { travou, motivo }.
  travou = true significa: NAO deixe a IA responder isso. Vai pra fila.
*/
export function checarGatilhos(texto) {
  const limpo = normalizar(texto);

  for (const { padrao, motivo } of GATILHOS) {
    if (padrao.test(limpo)) return { travou: true, motivo };
  }

  return { travou: false, motivo: null };
}
