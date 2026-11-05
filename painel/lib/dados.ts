import { criarClienteServidor } from "@/lib/supabase/servidor";

export type ResumoDoPainel = {
  abertas: number;
  rascunhos: number;
  followups: number;
  bancoPronto: boolean;
};

/*
  Contadores do rail. Se as tabelas ainda nao existem (SQL nao rodado),
  devolve bancoPronto: false pra tela pedir isso de forma clara,
  em vez de estourar uma stack trace na cara do consultor.
*/
export async function resumoDoPainel(): Promise<ResumoDoPainel> {
  const supabase = await criarClienteServidor();

  const [fila, rascunhos, followups] = await Promise.all([
    supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
    supabase
      .from("rascunhos")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase
      .from("solicitacoes_followup")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
  ]);

  if (fila.error || rascunhos.error) {
    return { abertas: 0, rascunhos: 0, followups: 0, bancoPronto: false };
  }

  return {
    abertas: fila.count ?? 0,
    rascunhos: rascunhos.count ?? 0,
    followups: followups.error ? 0 : (followups.count ?? 0),
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
  tipoProvedor?: "evolution" | "wwebjs";
  evolutionInstancia?: string | null;
  evolutionServerUrl?: string | null;
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

  let { data, error } = await supabase
    .from("conexoes")
    .select(
      "id, apelido, ativa, desconectar_pedido, estado, qr, telefone, aparelho, detalhe, visto_em, importar_dias, importar_total, importar_feitas, tipo_provedor, evolution_instancia, evolution_server_url"
    )
    .order("apelido");

  if (error && error.message.includes("evolution_instancia")) {
    const resLegado = await supabase
      .from("conexoes")
      .select(
        "id, apelido, ativa, desconectar_pedido, estado, qr, telefone, aparelho, detalhe, visto_em, importar_dias, importar_total, importar_feitas"
      )
      .order("apelido");
    data = (resLegado.data ?? []).map((l) => ({
      ...l,
      tipo_provedor: "evolution",
      evolution_instancia: null,
      evolution_server_url: null,
    }));
    error = resLegado.error;
  }

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
      tipoProvedor: linha.tipo_provedor ?? "evolution",
      evolutionInstancia: linha.evolution_instancia,
      evolutionServerUrl: linha.evolution_server_url,
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

/* ------------------------------------------------------------------
   Follow-ups supervisionados
------------------------------------------------------------------ */

export type FollowupPendente = {
  id: string;
  id_conversa: string;
  mensagem_sugerida: string;
  motivo: string;
  estagio_comercial: string | null;
  tentativa: number;
  momento_recomendado: string | null;
  criado_em: string;
  conversas: { nome: string | null; telefone: string; etapa: string } | null;
};

export async function followupsPendentes(): Promise<{
  followups: FollowupPendente[];
  tabelaPronta: boolean;
}> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("solicitacoes_followup")
    .select(
      "id, id_conversa, mensagem_sugerida, motivo, estagio_comercial, tentativa, momento_recomendado, criado_em, conversas(nome, telefone, etapa)"
    )
    .eq("status", "pendente")
    .order("criado_em", { ascending: true })
    .returns<FollowupPendente[]>();

  if (error) return { followups: [], tabelaPronta: false };
  return { followups: data ?? [], tabelaPronta: true };
}

/* ------------------------------------------------------------------
   Configuração e Consumo de IA Multiprovedor
------------------------------------------------------------------ */

export type ConfigIAPainel = {
  id?: string;
  provedor_primario: string;
  modelo_primario: string;
  provedor_secundario: string | null;
  modelo_secundario: string | null;
  fallback_ativo: boolean;
  temperatura: number;
  max_tokens: number;
};

export async function obterConfigIA(): Promise<ConfigIAPainel> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("config_ia")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return {
      provedor_primario: "gemini",
      modelo_primario: "gemini-3.5-flash-lite",
      provedor_secundario: "openai",
      modelo_secundario: "gpt-4o-mini",
      fallback_ativo: true,
      temperatura: 0.2,
      max_tokens: 400,
    };
  }

  return {
    id: data.id,
    provedor_primario: data.provedor_primario,
    modelo_primario: data.modelo_primario,
    provedor_secundario: data.provedor_secundario,
    modelo_secundario: data.modelo_secundario,
    fallback_ativo: data.fallback_ativo ?? true,
    temperatura: data.temperatura ?? 0.2,
    max_tokens: data.max_tokens ?? 400,
  };
}

export type ConsumoIARegistro = {
  id: string;
  provedor: string;
  modelo: string;
  operacao: string;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_total?: number;
  custo_estimado: number;
  latencia_ms: number;
  sucesso: boolean;
  foi_fallback?: boolean;
  criado_em: string;
};

export async function obterConsumoIARecente(limite = 30): Promise<{
  consumos: ConsumoIARegistro[];
  custoTotalHojeUsd: number;
}> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("consumo_ia")
    .select("id, provedor, modelo, operacao, tokens_entrada, tokens_saida, tokens_total, custo_estimado, latencia_ms, sucesso, foi_fallback, criado_em")
    .order("criado_em", { ascending: false })
    .limit(limite)
    .returns<ConsumoIARegistro[]>();

  if (error || !data) {
    return { consumos: [], custoTotalHojeUsd: 0 };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const custoTotalHojeUsd = data
    .filter((c) => c.criado_em?.startsWith(hoje))
    .reduce((acc, c) => acc + (Number(c.custo_estimado) || 0), 0);

  return { consumos: data, custoTotalHojeUsd };
}

export type MetricasOperacao = {
  totalConversas: number;
  conversasEmAndamento: number;
  aguardandoConsultor: number;
  assumidasConsultor: number;
  leadsQuentes: number;
  leadsMornos: number;
  leadsFrios: number;
  followupsPendentes: number;
  mensagensEnviadas: number;
  mensagensRecebidas: number;
  conexoesAtivas: number;
  totalConexoes: number;
  motorLigado: boolean;
  provedorIaAtivo: string;
  modeloIaAtivo: string;
};

export async function obterMetricasOperacao(): Promise<MetricasOperacao> {
  const supabase = await criarClienteServidor();

  const [
    conversasRes,
    pendenciasRes,
    followupsRes,
    mensagensEnvRes,
    mensagensRecRes,
    conexoesRes,
    configIaRes,
    motorNoAr,
  ] = await Promise.all([
    supabase
      .from("conversas")
      .select("id, estagio, qualificacao, so_voce"),
    supabase
      .from("pendencias")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
    supabase
      .from("solicitacoes_followup")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente"),
    supabase
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("direcao", "enviada"),
    supabase
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .eq("direcao", "recebida"),
    conexoesDoUsuario(),
    obterConfigIA(),
    algumMotorLigado(),
  ]);

  const conversas = conversasRes.data ?? [];
  const totalConversas = conversas.length;
  const conversasEmAndamento = conversas.filter((c) => c.estagio === "aguardando_bot").length;
  const aguardandoConsultor = pendenciasRes.count ?? conversas.filter((c) => c.estagio === "aguardando_voce").length;
  const assumidasConsultor = conversas.filter((c) => Boolean(c.so_voce)).length;
  const leadsQuentes = conversas.filter((c) => c.qualificacao === "quente").length;
  const leadsMornos = conversas.filter((c) => c.qualificacao === "morna").length;
  const leadsFrios = conversas.filter((c) => c.qualificacao === "fria").length;

  const conexoesAtivas = conexoesRes.conexoes.filter((c) => c.ligado).length;

  return {
    totalConversas,
    conversasEmAndamento,
    aguardandoConsultor,
    assumidasConsultor,
    leadsQuentes,
    leadsMornos,
    leadsFrios,
    followupsPendentes: followupsRes.count ?? 0,
    mensagensEnviadas: mensagensEnvRes.count ?? 0,
    mensagensRecebidas: mensagensRecRes.count ?? 0,
    conexoesAtivas,
    totalConexoes: conexoesRes.conexoes.length,
    motorLigado: motorNoAr,
    provedorIaAtivo: configIaRes.provedor_primario,
    modeloIaAtivo: configIaRes.modelo_primario,
  };
}

export type MensagemItem = {
  id: string;
  direcao: "recebida" | "enviada";
  texto: string;
  criado_em: string;
};

export type FatoMemoria = {
  chave: string;
  valor: string;
  confianca?: number;
};

export async function obterMensagensDaConversa(
  idConversa: string
): Promise<MensagemItem[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("mensagens")
    .select("id, direcao, texto, criado_em")
    .eq("id_conversa", idConversa)
    .order("criado_em", { ascending: true })
    .limit(200);

  return (data as MensagemItem[]) ?? [];
}

export async function obterFatosDaConversa(
  idConversa: string
): Promise<FatoMemoria[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("memoria")
    .select("*")
    .eq("id_conversa", idConversa)
    .maybeSingle();

  if (!data || typeof data !== "object") return [];

  const registro = data as Record<string, unknown>;
  const fatos: FatoMemoria[] = [];

  if (typeof registro.nome === "string" && registro.nome.trim()) {
    fatos.push({ chave: "nome", valor: registro.nome.trim(), confianca: 1 });
  }
  if (typeof registro.convenio === "string" && registro.convenio.trim()) {
    fatos.push({ chave: "convênio", valor: registro.convenio.trim().toUpperCase(), confianca: 1 });
  }
  if (typeof registro.banco === "string" && registro.banco.trim()) {
    fatos.push({ chave: "banco", valor: registro.banco.trim(), confianca: 1 });
  }
  if (typeof registro.objetivo === "string" && registro.objetivo.trim()) {
    fatos.push({
      chave: "objetivo",
      valor: registro.objetivo.replace(/_/g, " "),
      confianca: 0.9,
    });
  }
  if (typeof registro.etapa_comercial === "string" && registro.etapa_comercial.trim()) {
    fatos.push({
      chave: "etapa comercial",
      valor: registro.etapa_comercial.replace(/_/g, " "),
      confianca: 1,
    });
  }

  const coletado =
    registro.coletado && typeof registro.coletado === "object"
      ? (registro.coletado as Record<string, { confirmado?: boolean }>)
      : {};
  const docsConfirmados = Object.entries(coletado)
    .filter(([, v]) => v?.confirmado)
    .map(([k]) => k.replace(/_/g, " "));
  if (docsConfirmados.length > 0) {
    fatos.push({
      chave: "documentos recebidos",
      valor: docsConfirmados.join(", "),
      confianca: 1,
    });
  }

  const perguntado =
    registro.perguntado && typeof registro.perguntado === "object"
      ? (registro.perguntado as Record<string, unknown>)
      : {};
  const recusas =
    (registro.recusas as Record<string, { recusado?: boolean }> | undefined) ??
    (perguntado._recusas as Record<string, { recusado?: boolean }> | undefined) ??
    {};
  const itensRecusados = Object.entries(recusas)
    .filter(([, v]) => v?.recusado)
    .map(([k]) => k.replace(/_/g, " "));
  if (itensRecusados.length > 0) {
    fatos.push({
      chave: "recusas registradas",
      valor: itensRecusados.join(", "),
      confianca: 1,
    });
  }

  const ultimaPerguntaAgente =
    (registro.ultima_pergunta_agente as string | undefined) ??
    (perguntado._ultima_pergunta_agente as string | undefined);
  if (typeof ultimaPerguntaAgente === "string" && ultimaPerguntaAgente.trim()) {
    fatos.push({
      chave: "última pergunta do agente",
      valor: ultimaPerguntaAgente.trim(),
      confianca: 1,
    });
  }

  const simulacao =
    registro.simulacao && typeof registro.simulacao === "object"
      ? (registro.simulacao as Record<string, unknown>)
      : null;
  if (simulacao?.valor) {
    const origemSim = typeof simulacao.de === "string" ? simulacao.de : "sistema";
    fatos.push({
      chave: `simulação (${origemSim})`,
      valor: String(simulacao.valor),
      confianca: 1,
    });
  }

  return fatos;
}
