import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { RAIZ } from "./ambiente.js";
import { log } from "./log.js";

const rodar = promisify(execFile);

/*
  ============================================================================
  VARRER OS CHROMIUM QUE SOBRARAM

  Fechar a janela do motor no X mata o processo Node, mas os Chromium que o
  puppeteer abriu continuam de pe, segurando o lock do perfil de sessao. Na
  vez seguinte o WhatsApp Web nao consegue subir e o erro que aparece e
  "Execution context was destroyed" — que nao diz nada sobre a causa real.

  Aconteceu aqui: 10 processos pendurados de tentativas anteriores.

  A varredura e cirurgica: so mata Chromium cujo --user-data-dir aponta pra
  dentro de motor/sessao. O navegador do consultor nao e tocado.
  ============================================================================
*/
export async function matarChromiumsOrfaos() {
  const nossaPasta = path.join(RAIZ, "sessao");

  if (process.platform !== "win32") {
    // Linux/mac: pkill casando pelo nosso caminho.
    try {
      await rodar("pkill", ["-f", `--user-data-dir=${nossaPasta}`]);
    } catch {
      // Codigo 1 = nao achou nada. E o caso normal.
    }
    return;
  }

  const script = `
    $alvo = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
      Where-Object { $_.CommandLine -like '*${nossaPasta.replace(/\\/g, "\\\\")}*' }
    $n = @($alvo).Count
    $alvo | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
    Write-Output $n
  `;

  try {
    const { stdout } = await rodar(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 20_000 }
    );

    const quantos = Number(String(stdout).trim());
    if (quantos > 0) {
      log.info(`Limpei ${quantos} navegador(es) que sobraram da última vez.`);
    }
  } catch (erro) {
    // Nao poder limpar nao impede de tentar abrir: segue o jogo.
    log.erro(`não consegui varrer navegadores antigos: ${erro.message}`);
  }
}
