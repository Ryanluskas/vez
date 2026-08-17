import { criarClienteServidor } from "@/lib/supabase/servidor";

export type ResumoDoPainel = {
  abertas: number;
  rascunhos: number;
  bancoPronto: boolean;
};

/*
  Contadores do rail. Se as tabelas ainda nao existem (SQL nao rodado),
  devolve bancoPronto: false pra tela pedir isso de forma clara,
  em vez de estourar uma stack trace na cara do consultor.
*/
export async function resumoDoPainel(): Promise<ResumoDoPainel> {
  const supabase = await criarClienteServidor();

  const [fila, rascunhos] = await Promise.all([
    supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
    supabase
      .from("rascunhos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
  ]);

  if (fila.error || rascunhos.error) {
    return { abertas: 0, rascunhos: 0, bancoPronto: false };
  }

  return {
    abertas: fila.count ?? 0,
    rascunhos: rascunhos.count ?? 0,
    bancoPronto: true,
  };
}

export type EstadoDoMotor = "desligado" | "iniciando" | "aguardando_qr" | "conectado";

export type Conexao = {
  id: string;
  apelido: string;
  ativa: boolean;
  desconectando: boolean;
  estado: EstadoDoMotor;
  ligado: boolean;
  qr: string | null;
  telefone: string | null;
  aparelho: string | null;
  detalhe: string | null;
  vistoEm: string | null;
  /* Importação: pedida (dias > 0) e em andamento (total != null). */
  importarDias: number;
  importarTotal: number | null;
  importarFeitas: number;
};

/* O motor bate o coracao a cada 30s. Passou disso, tratamos como desligado. */
const TOLERANCIA_MS = 90_000;

/*
  O painel roda na Vercel e nao consegue perguntar nada pra maquina do
  consultor. Tudo que ele sabe vem da tabela `conexoes` e da ultima batida.
  Se as batidas pararam, o painel diz "desligado" — nunca chuta que esta no ar.
*/
export async function conexoesDoUsuario(): Promise<{
  conexoes: Conexao[];
  tabelaPronta: boolean;
}> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("conexoes")
    .select(
      "id, apelido, ativa, desconectar_pedido, estado, qr, telefone, aparelho, detalhe, visto_em, importar_dias, importar_total, importar_feitas"
    )
    .order("apelido");

  if (error) return { conexoes: [], tabelaPronta: false };

  const conexoes = (data ?? []).map((linha) => {
    const recente = Date.now() - new Date(linha.visto_em).getTime() < TOLERANCIA_MS;
    const estado = (recente ? linha.estado : "desligado") as EstadoDoMotor;

    return {
      id: linha.id,
      apelido: linha.apelido,
      ativa: linha.ativa,
      desconectando: linha.desconectar_pedido,
      estado,
      ligado: recente && linha.estado === "conectado",
      qr: recente && estado === "aguardando_qr" ? linha.qr : null,
      telefone: linha.telefone,
      aparelho: linha.aparelho,
      detalhe: recente ? linha.detalhe : "O motor parou de responder nesta máquina.",
      vistoEm: linha.visto_em,
      importarDias: linha.importar_dias ?? 0,
      importarTotal: recente ? linha.importar_total : null,
      importarFeitas: linha.importar_feitas ?? 0,
    };
  });

  return { conexoes, tabelaPronta: true };
}

/* Pro topo do painel: basta um número no ar pra luz acender. */
export async function algumMotorLigado(): Promise<boolean> {
  const { conexoes } = await conexoesDoUsuario();
  return conexoes.some((c) => c.ligado);
}

/* ------------------------------------------------------------------
   Estado do motor

   O motor roda na máquina do consultor e o painel na Vercel: um não
   enxerga o outro. O motor grava um batimento a cada 30s, e "offline" é
   a AUSÊNCIA de batimento recente — motor que caiu não consegue avisar
   que caiu.
------------------------------------------------------------------ */

/* Três batimentos de folga: um perdido não pode virar alarme falso. */
const VALIDADE_DO_BATIMENTO_MS = 100_000;

export type SaudeDoMotor = {
  estado: "ligado" | "reconectando" | "erro" | "offline";
  detalhe: string | null;
  servicos: Record<string, string>;
  desdeMs: number | null;
  tabelaPronta: boolean;
};

export async function saudeDoMotor(): Promise<SaudeDoMotor> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("motor_estado")
    .select("estado, detalhe, servicos, batimento_em")
    .maybeSingle();

  // Migração 18 ainda não rodou: não dá pra afirmar nada sobre o motor.
  if (error) {
    return { estado: "offline", detalhe: null, servicos: {}, desdeMs: null, tabelaPronta: false };
  }

  if (!data) {
    return { estado: "offline", detalhe: null, servicos: {}, desdeMs: null, tabelaPronta: true };
  }

  const desdeMs = Date.now() - new Date(data.batimento_em).getTime();
  const calado = desdeMs > VALIDADE_DO_BATIMENTO_MS;

  return {
    estado: calado ? "offline" : (data.estado as SaudeDoMotor["estado"]),
    detalhe: calado ? "sem sinal do motor" : data.detalhe,
    servicos: (data.servicos ?? {}) as Record<string, string>,
    desdeMs,
    tabelaPronta: true,
  };
}

/* ------------------------------------------------------------------
   Atividade e métricas do agente
------------------------------------------------------------------ */

export type EventoDoAgente = {
  id: string;
  tipo: string;
  detalhe: string | null;
  ferramenta: string | null;
  ok: boolean;
  ms: number | null;
  criado_em: string;
  conversas: { nome: string | null; telefone: string } | null;
};

export async function atividadeDoAgente(limite = 60): Promise<{
  eventos: EventoDoAgente[];
  tabelaPronta: boolean;
}> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("acoes_do_agente")
    .select("id, tipo, detalhe, ferramenta, ok, ms, criado_em, conversas(nome, telefone)")
    .order("criado_em", { ascending: false })
    .limit(limite)
    .returns<EventoDoAgente[]>();

  if (error) return { eventos: [], tabelaPronta: false };
  return { eventos: data ?? [], tabelaPronta: true };
}

export type MetricasDoAgente = {
  recebidas: number;
  enviadas: number;
  handoffs: number;
  ferramentas: number;
  validacoesReprovadas: number;
  erros: number;
  retentativas: number;
  followups: number;
  taxaAutomacao: number | null;
  msMedioResposta: number | null;
  msPiorResposta: number | null;
};

export async function metricasDeHoje(): Promise<MetricasDoAgente | null> {
  const supabase = await criarClienteServidor();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("metricas_do_agente")
    .select("*")
    .gte("dia", hoje.toISOString())
    .maybeSingle();

  if (error || !data) return null;

  return {
    recebidas: data.recebidas ?? 0,
    enviadas: data.enviadas ?? 0,
    handoffs: data.handoffs ?? 0,
    ferramentas: data.ferramentas ?? 0,
    validacoesReprovadas: data.validacoes_reprovadas ?? 0,
    erros: data.erros ?? 0,
    retentativas: data.retentativas ?? 0,
    followups: data.followups ?? 0,
    taxaAutomacao: data.taxa_automacao ?? null,
    msMedioResposta: data.ms_medio_resposta ?? null,
    msPiorResposta: data.ms_pior_resposta ?? null,
  };
}

export type MotivoDeHandoff = { motivo: string; vezes: number };

export async function motivosDeHandoff(): Promise<MotivoDeHandoff[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("motivos_de_handoff")
    .select("motivo, vezes")
    .order("vezes", { ascending: false })
    .limit(6)
    .returns<MotivoDeHandoff[]>();

  if (error) return [];
  return data ?? [];
}
