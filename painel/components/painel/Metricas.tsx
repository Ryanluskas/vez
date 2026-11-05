import type { MetricasDoAgente, MotivoDeHandoff } from "@/lib/dados";

/*
  Os números do dia.

  A taxa de automação é a única que importa de verdade: de tudo que chegou,
  quanto o bot resolveu sozinho. É ela que diz se o produto está cumprindo
  a promessa ou se o consultor continua atendendo tudo na mão.

  As outras existem pra explicar a taxa quando ela cai. Validação reprovada
  alta significa que falta um fato no manual; erro alto significa que
  alguma dependência está caindo.
*/

const NOME_DO_MOTIVO: Record<string, string> = {
  valor: "perguntou de dinheiro",
  informacao_desconhecida: "o bot não sabia",
  sem_resposta: "cliente sumiu",
  loop: "voltou demais",
  erro: "falha interna",
};

export function Metricas({
  metricas,
  motivos,
}: {
  metricas: MetricasDoAgente;
  motivos: MotivoDeHandoff[];
}) {
  const nada = metricas.recebidas === 0;

  return (
    <section className="mb-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-fio bg-fio sm:grid-cols-4 shadow-sm">
        <Numero
          rotulo="Chegaram"
          valor={metricas.recebidas}
          nota="mensagens de cliente"
        />
        <Numero
          rotulo="Respondidas"
          valor={metricas.enviadas}
          nota="sem passar por você"
          destaque
        />
        <Numero
          rotulo="Chamaram você"
          valor={metricas.handoffs}
          nota="foram pra Fila"
        />
        <Numero
          rotulo="Automação"
          valor={nada ? "—" : `${metricas.taxaAutomacao ?? 0}%`}
          nota="do que chegou"
          destaque
        />
      </div>

      {/* A segunda fileira só aparece quando tem o que mostrar. Zero em
          tudo é ruído: o consultor já sabe que hoje não aconteceu nada. */}
      {metricas.validacoesReprovadas + metricas.erros + metricas.ferramentas > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1">
          <Miudo rotulo="ferramentas" valor={metricas.ferramentas} />
          <Miudo rotulo="respostas barradas" valor={metricas.validacoesReprovadas} />
          <Miudo rotulo="erros" valor={metricas.erros} />
          <Miudo rotulo="retentativas" valor={metricas.retentativas} />
          <Miudo rotulo="follow-ups" valor={metricas.followups} />
          {metricas.msMedioResposta ? (
            <Miudo
              rotulo="resposta média"
              valor={`${(metricas.msMedioResposta / 1000).toFixed(1)}s`}
            />
          ) : null}
        </div>
      ) : null}

      {motivos.length ? (
        <div className="mt-3 rounded-2xl border border-fio bg-sup/60 backdrop-blur-xl px-4 py-3.5 shadow-sm">
          <p className="rotulo mb-2">Por que o bot te chamou</p>
          <div className="flex flex-col gap-1">
            {motivos.map((m) => (
              <div key={m.motivo} className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-texto2">
                  {NOME_DO_MOTIVO[m.motivo] ?? m.motivo}
                </span>
                <span className="num text-[12px] text-texto">{m.vezes}×</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Numero({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: number | string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className="bg-sup px-4 py-3">
      <p className="rotulo">{rotulo}</p>
      <p
        className={`num mt-1 text-[20px] leading-none ${
          destaque ? "text-jade" : "text-texto"
        }`}
      >
        {valor}
      </p>
      <p className="mt-1 text-[11px] text-texto3">{nota}</p>
    </div>
  );
}

function Miudo({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <span className="text-[11px] text-texto3">
      <span className="num text-texto2">{valor}</span> {rotulo}
    </span>
  );
}
