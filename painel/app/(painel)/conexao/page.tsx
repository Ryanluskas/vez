import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { OlhoNaConexao } from "@/components/painel/OlhoNaConexao";
import { CartaoDeNumero } from "@/components/conexao/CartaoDeNumero";
import { AdicionarNumero } from "@/components/conexao/AdicionarNumero";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { conexoesDoUsuario } from "@/lib/dados";

export const metadata: Metadata = { title: "Conexão" };

export default async function PaginaDeConexao() {
  const [usuario, { conexoes, tabelaPronta }] = await Promise.all([
    usuarioAtual(),
    conexoesDoUsuario(),
  ]);

  const algumLigado = conexoes.some((c) => c.ligado);
  const ativos = conexoes.filter((c) => c.ativa).length;

  if (!tabelaPronta) {
    return (
      <Tela>
        <CabecalhoDeTela
          titulo="Conexão"
          linha="Falta uma parte do banco para esta tela funcionar."
        />
        <div className="rounded-lg border border-fio bg-sup p-5">
          <p className="text-[13px] leading-relaxed text-texto2">
            Rode <code className="num text-texto">banco/07_varios_numeros.sql</code> no
            SQL Editor do Supabase e recarregue.
          </p>
        </div>
      </Tela>
    );
  }

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Conexão"
        linha="Seus números de WhatsApp. O motor roda no seu computador — as mensagens dos seus clientes não passam por servidor nenhum."
        rotulo={conexoes.length > 1 ? `${ativos} ativos` : undefined}
      />

      <div className="flex flex-col gap-3">
        {conexoes.map((c) => (
          <CartaoDeNumero key={c.id} conexao={c} />
        ))}
      </div>

      <AdicionarNumero quantos={ativos} />

      {!algumLigado ? (
        <section className="mt-8">
          <span className="rotulo">Ligar o motor</span>
          <ol className="mt-3 space-y-4">
            <Passo n={1} titulo="Dois cliques no atalho Vez">
              Ele está na sua Área de Trabalho. Sobe o painel e o motor juntos, e a
              janela que fica aberta é a do motor — é nela que aparece o log.
            </Passo>
            <Passo n={2} titulo="Entrar com esta conta">
              O motor faz login com{" "}
              <span className="num text-texto">{usuario?.email}</span>. É isso que
              amarra o WhatsApp desta máquina aos seus dados.
            </Passo>
            <Passo n={3} titulo="Escanear o QR de cada número">
              Ele aparece no cartão aqui em cima. No celular: WhatsApp → Aparelhos
              conectados → Conectar um aparelho.
            </Passo>
          </ol>
        </section>
      ) : null}

      <p className="mt-8 border-t border-fio pt-5 text-[12px] leading-relaxed text-texto3">
        O motor roda local porque o WhatsApp Web e a IA exigem uma máquina ligada. É
        isso que mantém as conversas dos seus clientes dentro do seu computador e a IA
        sem mensalidade.
      </p>

      <OlhoNaConexao
        conectado={algumLigado}
        importando={conexoes.some(
          (c) => c.importarDias > 0 || c.importarTotal !== null
        )}
      />
    </Tela>
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
