/*
  A espera e o assunto do produto. Ela tem tres temperaturas e cada uma
  tem cor propria — jade quando acabou de chegar, morno quando ja demorou,
  brasa quando o cliente esta esfriando. Cor aqui e informacao, nao enfeite.
*/

export type Temperatura = "nova" | "esperando" | "esfriando";

const CINCO_MIN = 5 * 60 * 1000;
const VINTE_MIN = 20 * 60 * 1000;

export function temperaturaDaEspera(ms: number): Temperatura {
  if (ms < CINCO_MIN) return "nova";
  if (ms < VINTE_MIN) return "esperando";
  return "esfriando";
}

export const COR_DA_BORDA: Record<Temperatura, string> = {
  nova: "bg-jade",
  esperando: "bg-morno",
  esfriando: "bg-brasa",
};

export const COR_DO_TEXTO: Record<Temperatura, string> = {
  nova: "text-texto2",
  esperando: "text-morno",
  esfriando: "text-brasa",
};

export const NOME_DA_TEMPERATURA: Record<Temperatura, string> = {
  nova: "chegou agora",
  esperando: "esperando",
  esfriando: "esfriando",
};

/* mm:ss no primeiro hora, depois 1h 20m. Sempre dois digitos, nunca dança. */
export function formatarEspera(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;

  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, "0")}m`;
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}
