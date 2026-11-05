/*
  ============================================================================
  DE ONDE VEIO O NÚMERO

  O valor que libera não é fixo. Muda de pessoa pra pessoa, muda com a
  margem, muda com o banco, muda com o mês. Não existe conta que o agente
  possa fazer pra chegar nele, e não existe padrão que ele possa aprender.

  Por isso a única pergunta que importa sobre um número é de ONDE ele veio.
  Não "faz sentido?", não "está na faixa esperada?" — de onde veio.

  TRÊS FONTES, E SÓ ELAS

    consultor   você digitou, respondendo a Fila. Você olhou o caso.
    lista       veio da planilha que você subiu, casada por telefone.
    ferramenta  veio de uma consulta a sistema, pelo executor.

  Qualquer outra procedência — inclusive o próprio cliente dizendo "me
  falaram que libera 5 mil" — NÃO é fonte. O cliente repetindo um número
  que ouviu na esquina não torna o número verdadeiro, e o agente ecoando
  isso de volta transforma um boato em compromisso seu.

  E o modelo nunca é fonte. Nem quando acerta.

  POR QUE ISSO É UM ARQUIVO E NÃO UM IF

  A regra estava espalhada: `guardarSimulacao` conferia na escrita,
  `resolver` conferia a existência mas não a origem, e o fluxo decidia o
  envio olhando outra coisa. Três lugares que precisam concordar são três
  lugares que vão discordar.

  Aqui a pergunta tem uma resposta só, e todo mundo faz a mesma pergunta.
  ============================================================================
*/

export const FONTES_CONFIAVEIS = ["consultor", "lista", "ferramenta"];
const VALIDADE_MAXIMA_PADRAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/*
  Esta procedência autoriza o número a sair?

  Vale pra escrita e pra leitura. Linha escrita antes de existir campo
  `de` volta com `de` vazio — e vazio não é confiável, é desconhecido.
*/
export function deFonteConfiavel(de) {
  return typeof de === "string" && FONTES_CONFIAVEIS.includes(de);
}

/*
  Existe número REAL e VIGENTE sobre este cliente?

  Devolve `{ tem: false }` quando:
    - não há simulação nenhuma;
    - há simulação, mas sem nenhum número dentro;
    - a simulação foi marcada como inválida (`valida === false`) ou expirou;
    - há número, mas de procedência desconhecida ou não confiável (ex.: campanha sem validação).
*/
export function valorConfiavel(memoria) {
  const s = memoria?.simulacao ?? {};
  const temNumero = !!(s.valor || s.parcela || s.taxa);

  if (!temNumero) return { tem: false, porque: "não tenho número nenhum" };

  if (s.valida === false) {
    return {
      tem: false,
      porque: "simulação marcada como inválida",
      suspeito: s,
    };
  }

  if (!deFonteConfiavel(s.de)) {
    return {
      tem: false,
      porque: `número sem procedência (de="${s.de ?? "vazio"}")`,
      /*
        Sinalizado, não apagado. Apagar esconderia o problema de quem for
        investigar; o que importa é que ele não sai daqui pro cliente.
      */
      suspeito: s,
    };
  }

  // Verificação de validade temporal explícita (expiraEm definido por guardarSimulacao)
  const agora = Date.now();
  if (s.expiraEm) {
    const expiraMs = new Date(s.expiraEm).getTime();
    if (Number.isFinite(expiraMs) && agora > expiraMs) {
      return {
        tem: false,
        porque: "simulação expirada",
        expirada: true,
        suspeito: s,
      };
    }
  }

  const camposAutorizados = Array.isArray(s.camposAutorizados)
    ? s.camposAutorizados
    : [
        s.valor ? "valor" : null,
        s.parcela ? "parcela" : null,
        s.taxa ? "taxa" : null,
        s.prazo ? "prazo" : null,
        s.banco ? "banco" : null,
      ].filter(Boolean);

  return {
    tem: true,
    simulacao: s,
    de: s.de,
    camposAutorizados,
  };
}

/*
  Como chamar a fonte quando o agente fala dela em voz alta.
  "Consegui isso pra você" é diferente de "olhei aqui na sua lista".
*/
export function comoChamarAFonte(de) {
  if (de === "lista") return "sua lista";
  if (de === "ferramenta") return "o sistema";
  return "você";
}

/*
  ============================================================================
  ESTE NÚMERO JÁ FOI DITO PRA ELE?

  O agente repetia. "Aquele valor" → manda o número. "Você já me disse o
  valor" → manda o mesmo número de novo, palavra por palavra. A frase do
  cliente era literalmente "eu já sei isso", e a resposta foi dizer de novo.

  A fonte da verdade aqui é a própria conversa, não um campo novo no banco.
  Um campo `ja_contei` teria que ser escrito no lugar certo, e quando não
  fosse, o agente ficaria calado sobre um número que nunca disse — que é
  pior que repetir. O texto trocado não mente: se o número está lá, ele foi
  dito.

  Comparo os DÍGITOS, não a frase. "4200", "R$ 4.200" e "4.200,00" são o
  mesmo número escrito de três jeitos, e a redação muda a cada mensagem
  porque quem escreve é o modelo.
  ============================================================================
*/
function soDigitos(texto) {
  return String(texto ?? "").replace(/\D+/g, "");
}

export function jaFoiDito(simulacao, contexto) {
  const conversa = soDigitos(contexto);
  if (!conversa) return false;

  const numeros = [simulacao?.valor, simulacao?.parcela, simulacao?.taxa]
    .map(soDigitos)
    .filter((n) => n.length >= 3);

  /*
    Corte em três dígitos: "12x" e "2 dias" aparecem em qualquer conversa
    e casariam com qualquer coisa. Um valor de simulação nunca tem menos
    de três dígitos.
  */
  if (numeros.length === 0) return false;

  return numeros.every((n) => conversa.includes(n));
}
