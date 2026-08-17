import { saudeDosServicos } from "./resiliencia.js";
import { log } from "./log.js";

/*
  ============================================================================
  O MOTOR DIZ QUE ESTÁ VIVO

  O painel roda na Vercel; o motor roda na máquina do consultor. Um não
  enxerga o outro. A única forma honesta de o painel saber que o motor está
  de pé é o motor dizer, de tempos em tempos, que está.

  Sem isso o painel mente por omissão: mostra a fila vazia e o consultor
  conclui que ninguém escreveu, quando na verdade o motor caiu às 9h e as
  mensagens estão chegando no WhatsApp sem ninguém tratar.

  Note o que NÃO é gravado: 'offline'. Motor que caiu não consegue avisar
  que caiu — se conseguisse, não teria caído. Offline é a AUSÊNCIA de
  batimento recente, e quem conclui isso é o painel, olhando o relógio.
  ============================================================================
*/

/*
  Trinta segundos. Quem decide a partir de quando o silêncio vira "offline"
  é o painel (lib/dados.ts), com três batimentos de folga — um perdido não
  pode virar alarme falso. O número mora lá porque é lá que ele é usado.
*/
const INTERVALO_MS = 30_000;

export function criarBatimento({ supabase, userId, versao = null }) {
  let estadoAtual = "ligado";
  let detalheAtual = null;

  async function bater() {
    try {
      await supabase.from("motor_estado").upsert(
        {
          user_id: userId,
          estado: estadoAtual,
          detalhe: detalheAtual,
          servicos: saudeDosServicos(),
          versao,
          batimento_em: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      /*
        Banco fora é exatamente quando o batimento falha — e é exatamente
        quando ele menos importa. Insistir aqui só encheria o log de erro
        do mesmo problema que já está sendo tratado em outro lugar.
      */
    }
  }

  return {
    /* O motor muda de humor: reconectando um número, erro que não passou. */
    marcar(estado, detalhe = null) {
      if (estado === estadoAtual && detalhe === detalheAtual) return;
      estadoAtual = estado;
      detalheAtual = detalhe;
      bater();
    },

    ligar() {
      bater();
      const relogio = setInterval(bater, INTERVALO_MS);
      relogio.unref?.();

      return async () => {
        clearInterval(relogio);
        /*
          Ao sair, marca erro com aviso claro em vez de deixar o painel
          adivinhar pelo relógio. Fechar o motor é uma decisão, e o painel
          deve mostrá-la na hora, não daqui a dois minutos.
        */
        estadoAtual = "erro";
        detalheAtual = "motor encerrado";
        await bater();
        log.info("Avisei o painel que estou saindo.");
      };
    },
  };
}
