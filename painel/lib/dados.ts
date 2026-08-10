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
    .select("id, apelido, ativa, desconectar_pedido, estado, qr, telefone, aparelho, detalhe, visto_em")
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
    };
  });

  return { conexoes, tabelaPronta: true };
}

/* Pro topo do painel: basta um número no ar pra luz acender. */
export async function algumMotorLigado(): Promise<boolean> {
  const { conexoes } = await conexoesDoUsuario();
  return conexoes.some((c) => c.ligado);
}
