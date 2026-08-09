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

/* Le o tema salvo antes da primeira pintura, senao o painel pisca branco. */
const semPiscar = `(function(){try{var t=localStorage.getItem("vez:tema");if(t==="claro")document.documentElement.setAttribute("data-tema","claro")}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: semPiscar }} />
      </head>
      <body className="min-h-full bg-fundo text-texto">{children}</body>
    </html>
  );
}
