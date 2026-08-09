import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Display: so no wordmark e nos titulos de tela. Apertado e pesado, nunca solto. */
const display = Bricolage_Grotesque({
  variable: "--fonte-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

/* Interface. */
const sans = Geist({
  variable: "--fonte-sans",
  subsets: ["latin"],
});

/* Todo numero do produto: relogio de espera, telefone, contador. */
const mono = Geist_Mono({
  variable: "--fonte-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Vez",
    template: "%s · Vez",
  },
  description:
    "Atendimento de WhatsApp com IA para consultores de credito. O que a IA nao sabe vira fila, na ordem de chegada.",
  applicationName: "Vez",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
  ],
};

/*
  Le o tema salvo antes da primeira pintura, senao o painel pisca escuro
  pra quem escolheu claro. Roda enquanto o navegador ainda esta lendo o
  HTML — antes do React existir, entao nao adianta useEffect aqui.
*/
const semPiscar = `(function(){try{var t=localStorage.getItem("vez:tema");if(t)document.documentElement.setAttribute("data-tema",t)}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      data-tema="escuro"
      /* O script acima troca este atributo antes do React montar. Sem isto,
         o React reclama que o servidor e o cliente discordam — e discordam
         mesmo, de proposito. Aqui o DOM ganha. */
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: semPiscar }} />
      </head>
      <body className="min-h-full bg-fundo text-texto">{children}</body>
    </html>
  );
}
