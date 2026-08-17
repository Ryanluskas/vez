import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela, Tela, Vazio } from "@/components/ui/Tela";
import { SaudeDoMotor } from "@/components/painel/SaudeDoMotor";
import { LinhaDoTempo } from "@/components/painel/LinhaDoTempo";
import { Metricas } from "@/components/painel/Metricas";
import {
  atividadeDoAgente,
  saudeDoMotor,
  metricasDeHoje,
  motivosDeHandoff,
} from "@/lib/dados";

export const metadata: Metadata = { title: "Atividade" };

/*
  A tela que responde "o que o bot andou fazendo?".

  Ela existe porque um agente autônomo sem esta tela é um agente em que
  ninguém confia. O consultor precisa poder abrir, olhar trinta segundos e
  entender o que aconteceu — senão ele volta pro modo manual e o produto
  perde a razão de existir.

  O que NÃO aparece aqui: raciocínio do modelo. Só justificativa
  operacional curta. Chain-of-thought não ajuda a decidir nada e ainda dá a
  impressão de que a decisão foi do modelo — que não foi.
*/
export default async function PaginaDeAtividade() {
  const [motor, { eventos, tabelaPronta }, metricas, motivos] = await Promise.all([
    saudeDoMotor(),
    atividadeDoAgente(60),
    metricasDeHoje(),
    motivosDeHandoff(),
  ]);

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Atividade"
        linha="O que o agente fez, na ordem. Do mais recente pro mais antigo."
        rotulo="Hoje"
      />

      <div className="mb-6">
        <SaudeDoMotor estado={motor} />
      </div>

      {!tabelaPronta ? (
        <Vazio
          titulo="Falta uma parte do banco"
          corpo="A atividade do agente é gravada numa tabela que ainda não existe neste projeto do Supabase."
          acao={
            <code className="num text-[12px] text-texto">banco/18_observabilidade.sql</code>
          }
        />
      ) : (
        <>
          {metricas ? <Metricas metricas={metricas} motivos={motivos} /> : null}

          {eventos.length === 0 ? (
            <Vazio
              titulo="Nada ainda"
              corpo="Quando um cliente escrever, cada passo do agente aparece aqui: o que ele entendeu, o que decidiu, que ferramenta usou e se a resposta passou na validação."
              acao={
                <Link
                  href="/conexao"
                  className="text-[13px] text-jade underline underline-offset-4 hover:text-jade-forte"
                >
                  Conectar o WhatsApp
                </Link>
              }
            />
          ) : (
            <LinhaDoTempo eventos={eventos} />
          )}
        </>
      )}
    </Tela>
  );
}
