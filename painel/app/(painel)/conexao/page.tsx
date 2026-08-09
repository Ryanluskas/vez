import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { OlhoNaConexao } from "@/components/painel/OlhoNaConexao";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { estadoDaConexao, type EstadoDoMotor } from "@/lib/dados";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Conexão" };

const ROTULO: Record<EstadoDoMotor, string> = {
  desligado: "Motor desligado",
  iniciando: "Abrindo o WhatsApp",
  aguardando_qr: "Esperando você escanear",
  conectado: "Conectado e atendendo",
};

const COR_DO_PONTO: Record<EstadoDoMotor, string> = {
  desligado: "bg-texto3",
  iniciando: "bg-morno",
  aguardando_qr: "bg-brasa",
  conectado: "bg-jade",
};

export default async function PaginaDeConexao() {
  const [usuario, conexao] = await Promise.all([usuarioAtual(), estadoDaConexao()]);

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Conexão"
        linha="O motor roda no seu computador. As mensagens dos seus clientes não passam por servidor nenhum."
      />

      {!conexao.tabelaPronta ? (
        <div className="rounded-lg border border-fio bg-sup p-5">
          <p className="text-[14px] text-texto">Falta a tabela de conexão</p>
          <p className="mt-2 text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/03_conexoes.sql</code> no SQL
            Editor do Supabase e recarregue esta página.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-fio bg-sup p-5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 rounded-full", COR_DO_PONTO[conexao.estado])}
              />
              <span className="text-[14px] text-texto">{ROTULO[conexao.estado]}</span>
            </div>

            {conexao.estado === "conectado" ? (
              <p className="mt-2 text-[13px] leading-relaxed text-texto2">
                Pareado com{" "}
                <span className="num text-texto">{conexao.telefone ?? "—"}</span>
                {conexao.aparelho ? ` · ${conexao.aparelho}` : ""}. Toda mensagem que
                chegar agora entra nas Conversas.
              </p>
            ) : conexao.detalhe ? (
              <p className="mt-2 text-[13px] leading-relaxed text-texto2">
                {conexao.detalhe}
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-texto2">
                O motor não está rodando nesta conta. Ligue ele no seu computador e o QR
                aparece aqui sozinho.
              </p>
            )}

            {conexao.vistoEm && conexao.estado === "desligado" ? (
              <p className="mt-2 text-[12px] text-texto3">
                Última batida:{" "}
                {new Date(conexao.vistoEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : null}
          </div>

          {conexao.qr ? <CodigoQR imagem={conexao.qr} /> : null}
        </>
      )}

      {conexao.estado !== "conectado" ? (
        <section className="mt-8">
          <span className="rotulo">Ligar o motor</span>
          <ol className="mt-3 space-y-4">
            <Passo n={1} titulo="Preencher o motor/.env">
              As mesmas chaves do Supabase que estão no painel, mais o e-mail e a senha
              desta conta —{" "}
              <span className="num text-texto">{usuario?.email}</span>. É isso que
              amarra o WhatsApp desta máquina aos seus dados.
            </Passo>
            <Passo n={2} titulo="Rodar na pasta do projeto">
              <code className="num mt-2 block rounded-md border border-fio bg-sup px-3 py-2 text-texto">
                npm start --prefix motor
              </code>
              Precisa ficar aberto enquanto você quiser ser atendido.
            </Passo>
            <Passo n={3} titulo="Escanear o QR">
              Ele aparece nesta tela. No celular: WhatsApp → Aparelhos conectados →
              Conectar um aparelho.
            </Passo>
          </ol>
        </section>
      ) : null}

      <p className="mt-8 border-t border-fio pt-5 text-[12px] leading-relaxed text-texto3">
        O motor roda local porque o WhatsApp Web e a IA exigem uma máquina ligada. É
        isso que mantém as conversas dos seus clientes dentro do seu computador e a IA
        sem mensalidade.
      </p>

      <OlhoNaConexao conectado={conexao.ligado} />
    </Tela>
  );
}

function CodigoQR({ imagem }: { imagem: string }) {
  return (
    <div className="mt-4 flex flex-col items-center rounded-lg border border-fio bg-sup px-5 py-7">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL vinda do banco, não passa pelo otimizador */}
      <img
        src={imagem}
        alt="Código QR para conectar o WhatsApp"
        width={240}
        height={240}
        className="rounded-md"
      />
      <p className="mt-4 max-w-xs text-center text-[13px] leading-relaxed text-texto2">
        No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
      </p>
      <p className="mt-1.5 text-[12px] text-texto3">
        O código troca sozinho a cada poucos segundos.
      </p>
    </div>
  );
}

function Passo({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="num mt-0.5 shrink-0 text-[12px] text-texto3">{n}</span>
      <div className="min-w-0">
        <p className="text-[14px] text-texto">{titulo}</p>
        <div className="mt-1 text-[13px] leading-relaxed text-texto2">{children}</div>
      </div>
    </li>
  );
}
