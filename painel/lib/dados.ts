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
  estado: EstadoDoMotor;
  ligado: boolean;
  qr: string | null;
  telefone: string | null;
  aparelho: string | null;
  detalhe: string | null;
  vistoEm: string | null;
  tabelaPronta: boolean;
};

/* O motor bate o coracao a cada 30s. Passou disso, tratamos como desligado. */
const TOLERANCIA_MS = 90_000;

const DESLIGADO: Conexao = {
  estado: "desligado",
  ligado: false,
  qr: null,
  telefone: null,
  aparelho: null,
  detalhe: null,
  vistoEm: null,
  tabelaPronta: true,
};

/*
  O painel roda na Vercel e nao consegue perguntar nada pra maquina do
  consultor. Tudo que ele sabe vem da tabela `conexoes` e da ultima batida.
  Se as batidas pararam, o painel diz "desligado" — nunca chuta que esta no ar.
*/
export async function estadoDaConexao(): Promise<Conexao> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("conexoes")
    .select("estado, qr, telefone, aparelho, detalhe, visto_em")
    .maybeSingle();

  if (error) return { ...DESLIGADO, tabelaPronta: false };
  if (!data) return DESLIGADO;

  const recente = Date.now() - new Date(data.visto_em).getTime() < TOLERANCIA_MS;
  const estado = (recente ? data.estado : "desligado") as EstadoDoMotor;

  return {
    estado,
    ligado: recente && data.estado === "conectado",
    qr: recente && estado === "aguardando_qr" ? data.qr : null,
    telefone: data.telefone,
    aparelho: data.aparelho,
    detalhe: recente ? data.detalhe : "O motor parou de responder nesta máquina.",
    vistoEm: data.visto_em,
    tabelaPronta: true,
  };
}
