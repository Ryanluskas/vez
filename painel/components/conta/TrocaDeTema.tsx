"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

type Tema = "escuro" | "claro";

const CHAVE = "vez:tema";

/*
  O tema mora no localStorage, não no estado do React — e é por isso que
  `useSyncExternalStore` é a ferramenta certa aqui em vez de useState com
  useEffect.

  Ler no efeito e chamar setState causa uma renderização em cascata (o lint
  do React 19 reclama disso com razão). Pior: o Strict Mode remonta o
  componente em desenvolvimento e, nessa remontagem, o React limpa os
  atributos do <html> que não vêm do JSX — apagando o que o script
  anti-flash tinha posto. Quem manda tem que ser o localStorage, e este
  hook existe exatamente pra ler de fora do React sem mentir na hidratação.
*/

function assinar(avisar: () => void) {
  // Outra aba trocou o tema: esta acompanha.
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}

function lerDoNavegador(): Tema {
  try {
    return localStorage.getItem(CHAVE) === "claro" ? "claro" : "escuro";
  } catch {
    // Navegador sem storage: fica no padrão escuro.
    return "escuro";
  }
}

/* No servidor não existe localStorage. O padrão casa com o que o layout
   renderiza, então a hidratação não acusa diferença. */
function lerNoServidor(): Tema {
  return "escuro";
}

export function TrocaDeTema() {
  const tema = useSyncExternalStore(assinar, lerDoNavegador, lerNoServidor);

  /*
    O atributo do <html> é o efeito colateral legítimo: sincronizar o React
    com um sistema externo, que é justamente para o que o efeito serve.
  */
  useEffect(() => {
    document.documentElement.setAttribute("data-tema", tema);
  }, [tema]);

  const aplicar = useCallback((novo: Tema) => {
    document.documentElement.setAttribute("data-tema", novo);
    try {
      localStorage.setItem(CHAVE, novo);
      /*
        O evento `storage` só dispara nas OUTRAS abas. Sem este disparo
        manual, o botão clicado não se atualiza — o estado mudou fora do
        React e o React não teve como saber.
      */
      window.dispatchEvent(new StorageEvent("storage", { key: CHAVE, newValue: novo }));
    } catch {
      // Navegador sem storage: o tema vale só nesta aba, e o atributo já foi.
    }
  }, []);

  return (
    <div
      role="group"
      aria-label="Tema"
      className="inline-flex rounded-md border border-fio p-0.5"
    >
      {(["escuro", "claro"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => aplicar(t)}
          aria-pressed={tema === t}
          className={cn(
            "rounded-[5px] px-3 py-1 text-[12px] capitalize transition-colors",
            tema === t ? "bg-sup2 text-texto" : "text-texto2 hover:text-texto"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
