import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./ambiente.js";
import { log } from "./log.js";

/*
  ============================================================================
  UM MOTOR DE CADA VEZ

  O consultor vai dar dois cliques no atalho com o motor já aberto. É certo
  que vai — o ícone está ali e a janela pode estar minimizada.

  Dois motores é o pior estado possível: cada um abre um Chromium para o
  MESMO perfil de sessão, os dois se derrubam, e o erro que aparece
  ("Execution context was destroyed") não fala nada sobre haver dois. Foi
  exatamente isso que aconteceu aqui: 3 motores e 21 Chromium ao mesmo tempo.

  A trava é um arquivo com o PID. Se o PID de dentro ainda estiver vivo, o
  segundo motor avisa e sai. Se não estiver — máquina desligou no tranco —
  a trava é considerada abandonada e o novo motor assume.
  ============================================================================
*/

const ARQUIVO = path.join(RAIZ, "sessao", "motor.lock");

function estaVivo(pid) {
  try {
    // Sinal 0 não mata nada: só pergunta se o processo existe.
    process.kill(pid, 0);
    return true;
  } catch (erro) {
    // EPERM = existe mas é de outro usuário. Existe, então conta como vivo.
    return erro.code === "EPERM";
  }
}

/* Devolve true se conseguiu a trava. False = já tem motor rodando. */
export function pegarTrava() {
  try {
    const dono = Number(fs.readFileSync(ARQUIVO, "utf8").trim());

    if (Number.isInteger(dono) && dono !== process.pid && estaVivo(dono)) {
      log.destaque(
        `Já tem um Vez rodando nesta máquina (processo ${dono}).\n` +
          `   Use a janela que já está aberta. Abrir dois faz os dois brigarem\n` +
          `   pelo mesmo WhatsApp e nenhum funciona.`
      );
      return false;
    }
  } catch {
    // Sem arquivo, ou ilegível: caminho livre.
  }

  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.writeFileSync(ARQUIVO, String(process.pid));
  } catch (erro) {
    // Não conseguir gravar a trava não é motivo pra não atender.
    log.erro(`não consegui gravar a trava: ${erro.message}`);
  }

  return true;
}

export function soltarTrava() {
  try {
    const dono = Number(fs.readFileSync(ARQUIVO, "utf8").trim());
    if (dono === process.pid) fs.rmSync(ARQUIVO, { force: true });
  } catch {
    // Já sumiu: nada a fazer.
  }
}
