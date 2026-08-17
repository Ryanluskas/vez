/*
  ============================================================================
  A LISTA: A PRIMEIRA FONTE REAL DE VALOR

  Até aqui nenhum número de dinheiro existia dentro do produto. A regra de
  ouro dizia: valor vem do consultor, nunca do modelo. `consultar_simulacao`
  existia só pra responder "não tenho esse dado".

  A lista não afrouxa essa regra — ela cumpre. O valor continua não vindo do
  modelo: vem de uma planilha que o consultor apurou e subiu. O modelo
  continua decidindo COMO falar, nunca QUAL é o número.

  TRÊS COISAS QUE ESTE ARQUIVO GARANTE

  1. Campo que o consultor não liberou não existe. Não é "não mostrado" —
     não sai daqui, então o redator nunca o vê e não tem como vazá-lo.

  2. A porcentagem é aplicada AQUI, no código, antes de qualquer prompt. O
     modelo recebe o número já reduzido e não sabe que existiu outro. Não há
     como ele "arredondar de volta" para o valor cheio.

  3. Sem lista, ou com o cliente fora dela, a resposta é a mesma de sempre:
     não tem o dado. A lista é atalho, nunca dependência.
  ============================================================================
*/

/*
  Os campos que podem chegar ao cliente, e de onde cada um sai na planilha.

  A chave é o nome curto que aparece no painel; `coluna` é o cabeçalho da
  planilha. Planilha com outro cabeçalho simplesmente não preenche o campo —
  melhor um campo vazio que um campo com o número errado.
*/
export const CAMPOS_DA_LISTA = {
  reducao_total: {
    rotulo: "Redução total",
    ajuda: "Quanto o cliente economiza no total. É sobre este que a porcentagem incide.",
    coluna: "Reducao_Total",
    tipo: "dinheiro",
    aplicaPorcentagem: true,
  },
  margem_livre: {
    rotulo: "Margem livre",
    ajuda: "Quanto sobra da margem consignável.",
    coluna: "Margem_Livre",
    tipo: "dinheiro",
  },
  saldo_devedor: {
    rotulo: "Saldo devedor",
    ajuda: "Quanto ele ainda deve, somando os contratos.",
    coluna: "Saldo_Devedor_Total",
    tipo: "dinheiro",
  },
  soma_parcelas: {
    rotulo: "Soma das parcelas",
    ajuda: "Quanto ele paga por mês hoje, somando tudo.",
    coluna: "Soma_Parcelas",
    tipo: "dinheiro",
  },
  total_parcelas: {
    rotulo: "Total de parcelas",
    ajuda: "Quantas parcelas ao todo.",
    coluna: "Total_Parcelas",
    tipo: "numero",
  },
  contratos: {
    rotulo: "Contratos",
    ajuda: "Cada contrato com taxa, valor da parcela e quantas já pagou.",
    tipo: "contratos",
  },
};

export const CHAVES_DOS_CAMPOS = Object.keys(CAMPOS_DA_LISTA);

/* ------------------------------------------------------------------
   Números
------------------------------------------------------------------ */

/*
  A planilha mistura formatos: `Reducao_Total` vem como número (3174.54) e
  `Margem_Livre` vem como texto ("R$ 1.150,94"). Ler os dois do mesmo jeito
  é o que evita um "R$ 1150,94" virar 115094.
*/
export function comoNumero(bruto) {
  if (bruto === null || bruto === undefined || bruto === "") return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;

  const limpo = String(bruto)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");

  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/* R$ 1.150,94 — do jeito que se escreve no WhatsApp. */
export function comoDinheiro(n) {
  if (n === null) return null;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/*
  O telefone da planilha vira o mesmo formato que o WhatsApp entrega.

  Guardamos os últimos 8 dígitos junto porque o WhatsApp às vezes entrega o
  número sem o nono dígito, às vezes com, às vezes com o 55 na frente e às
  vezes sem. Casar só pelo número inteiro perderia cliente de verdade.
*/
export function normalizarTelefone(ddd, celular) {
  const so = (v) => String(v ?? "").replace(/\D/g, "");
  const d = so(ddd);
  const c = so(celular);
  if (!c) return { telefone: null, curto: null };

  const inteiro = `55${d}${c}`.replace(/^(55)+/, "55");
  return { telefone: inteiro, curto: c.slice(-8) };
}

/* ------------------------------------------------------------------
   Montar o que o bot pode falar
------------------------------------------------------------------ */

function contratosDe(dados) {
  const saida = [];

  for (let i = 1; i <= 15; i++) {
    const contrato = dados[`Contrato_${i}`];
    if (!contrato) continue;

    const parcela = comoNumero(dados[`Valor_Parcela_${i}`]);
    saida.push({
      contrato: String(contrato),
      taxa: dados[`Taxa_${i}`] ?? null,
      parcela: comoDinheiro(parcela),
      pagas: comoNumero(dados[`Parcelas_Pagas_${i}`]),
      total: comoNumero(dados[`Parcelas_${i}`]),
    });
  }

  return saida;
}

/*
  Devolve só o que o consultor liberou, já com a porcentagem aplicada.

  `porcentagem` é multiplicação: 66 sobre 100 dá 66. O consultor pensa nisso
  como "eu passo 66 pro cliente", e é assim que ele configura no painel.
*/
export function montarValores(dados, { campos = [], porcentagem = 100 } = {}) {
  const liberados = new Set(campos);
  const valores = {};
  const numeros = [];

  for (const [chave, def] of Object.entries(CAMPOS_DA_LISTA)) {
    if (!liberados.has(chave)) continue;

    if (def.tipo === "contratos") {
      const lista = contratosDe(dados);
      if (lista.length) {
        valores.contratos = lista;
        for (const c of lista) {
          if (c.parcela) numeros.push(c.parcela);
          if (c.taxa) numeros.push(String(c.taxa));
        }
      }
      continue;
    }

    const cru = comoNumero(dados[def.coluna]);
    if (cru === null) continue;

    /*
      A redução sai reduzida. O modelo recebe o número já final e não sabe
      que existiu outro — não há como ele "arredondar de volta".
    */
    const valor = def.aplicaPorcentagem ? (cru * porcentagem) / 100 : cru;

    const texto = def.tipo === "dinheiro" ? comoDinheiro(valor) : String(Math.round(valor));
    valores[chave] = texto;
    numeros.push(texto);
  }

  return { valores, numeros };
}

/*
  Vira o texto que entra no prompt, no lugar da resposta do consultor.

  Formato de bilhete, não de relatório: é isso que o consultor digitaria na
  Fila, e o redator já sabe embrulhar exatamente esse formato.
*/
export function emTexto(valores) {
  const linhas = [];

  if (valores.reducao_total) linhas.push(`economia total: ${valores.reducao_total}`);
  if (valores.soma_parcelas) linhas.push(`paga hoje por mês: ${valores.soma_parcelas}`);
  if (valores.saldo_devedor) linhas.push(`saldo devedor: ${valores.saldo_devedor}`);
  if (valores.margem_livre) linhas.push(`margem livre: ${valores.margem_livre}`);
  if (valores.total_parcelas) linhas.push(`total de parcelas: ${valores.total_parcelas}`);

  for (const c of valores.contratos ?? []) {
    const partes = [`contrato ${c.contrato}`];
    if (c.parcela) partes.push(`parcela de ${c.parcela}`);
    if (c.taxa) partes.push(`taxa ${c.taxa}`);
    if (c.pagas !== null && c.total !== null) partes.push(`${c.pagas} de ${c.total} pagas`);
    linhas.push(partes.join(", "));
  }

  return linhas.join(" · ");
}

/* ------------------------------------------------------------------
   Buscar o cliente
------------------------------------------------------------------ */

/*
  Procura o telefone nas listas ATIVAS. Primeiro pelo número inteiro;
  depois pelos últimos 8 dígitos, que é o que sobrevive às variações do
  WhatsApp.

  Nunca estoura: sem tabela, sem lista ou sem cliente, a resposta é a mesma
  — não achei. E não achar é um estado normal, não um erro.
*/
export function criarLista(supabase, userId) {
  async function preferenciasDaLista() {
    const { data } = await supabase
      .from("preferencias")
      .select("campos_da_lista, porcentagem_reducao")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      campos: data?.campos_da_lista ?? [],
      porcentagem: data?.porcentagem_reducao ?? 100,
    };
  }

  async function buscarPorTelefone(telefone) {
    const so = String(telefone ?? "").replace(/\D/g, "");
    if (so.length < 8) return null;

    const curto = so.slice(-8);

    const { data, error } = await supabase
      .from("lista_clientes")
      .select("id, nome, cpf, telefone, dados, listas!inner(ativa, nome)")
      .eq("listas.ativa", true)
      .or(`telefone.eq.${so},telefone_curto.eq.${curto}`)
      .limit(2);

    // Tabela ainda não criada (19_listas.sql): é ausência, não erro.
    if (error || !data?.length) return null;

    /*
      Dois clientes com o mesmo final de telefone. Não dá pra escolher, e
      escolher errado é falar o saldo de um pro outro. Devolve nada.
    */
    if (data.length > 1) {
      const exato = data.filter((d) => d.telefone === so);
      if (exato.length !== 1) return null;
      return exato[0];
    }

    return data[0];
  }

  return {
    preferenciasDaLista,

    /*
      O que o bot pode dizer sobre este telefone, agora.
      Devolve null quando não há nada — e quem chama trata isso como o
      caminho normal, não como falha.
    */
    async valoresPara(telefone) {
      const cliente = await buscarPorTelefone(telefone);
      if (!cliente) return null;

      const { campos, porcentagem } = await preferenciasDaLista();
      if (!campos.length) return null;

      const { valores, numeros } = montarValores(cliente.dados ?? {}, {
        campos,
        porcentagem,
      });

      if (Object.keys(valores).length === 0) return null;

      return {
        nome: cliente.nome ?? null,
        lista: cliente.listas?.nome ?? null,
        porcentagem,
        valores,
        // O que o validador vai aceitar como número legítimo no rascunho.
        numeros,
        texto: emTexto(valores),
      };
    },
  };
}
