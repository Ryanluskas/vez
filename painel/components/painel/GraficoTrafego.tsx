"use client";

import React from "react";

interface GraficoTrafegoProps {
  totalRecebidas: number;
  totalEnviadas: number;
}

export function GraficoTrafego({
  totalRecebidas,
  totalEnviadas,
}: GraficoTrafegoProps) {
  // Distribuição estimada por faixa horária comercial proporcional aos totais reais
  const distribuicao = [
    { hora: "08:00", fatorRec: 0.08, fatorEnv: 0.06 },
    { hora: "10:00", fatorRec: 0.22, fatorEnv: 0.24 },
    { hora: "12:00", fatorRec: 0.18, fatorEnv: 0.16 },
    { hora: "14:00", fatorRec: 0.26, fatorEnv: 0.28 },
    { hora: "16:00", fatorRec: 0.16, fatorEnv: 0.18 },
    { hora: "18:00", fatorRec: 0.1, fatorEnv: 0.08 },
  ];

  const pontos = distribuicao.map((d) => ({
    hora: d.hora,
    recebidas: Math.round(totalRecebidas * d.fatorRec),
    enviadas: Math.round(totalEnviadas * d.fatorEnv),
  }));

  const maxVal = Math.max(
    1,
    ...pontos.map((p) => Math.max(p.recebidas, p.enviadas))
  );

  const altura = 90;
  const largura = 480;
  const paddingX = 20;
  const paddingY = 12;
  const chartW = largura - paddingX * 2;
  const chartH = altura - paddingY * 2;

  function getY(valor: number) {
    return paddingY + chartH - (valor / maxVal) * chartH;
  }

  function getX(index: number) {
    return paddingX + (index / (pontos.length - 1)) * chartW;
  }

  const pathRecebidas = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.recebidas).toFixed(1)}`)
    .join(" ");

  const pathEnviadas = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.enviadas).toFixed(1)}`)
    .join(" ");

  return (
    <div className="w-full space-y-3">
      {/* Tabela Resumo Estilo Livro-Caixa */}
      <div className="border border-fio rounded-[6px] overflow-hidden">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-sup2 text-texto2 font-medium border-b border-fio">
            <tr>
              <th className="py-2 px-3 font-normal">Fluxo</th>
              <th className="py-2 px-3 font-normal text-right">Total</th>
              <th className="py-2 px-3 font-normal text-right">Média/Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fio">
            <tr>
              <td className="py-2 px-3 text-texto flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-texto3" />
                Recebidas (Clientes)
              </td>
              <td className="py-2 px-3 font-mono text-right num text-texto font-medium">
                {totalRecebidas}
              </td>
              <td className="py-2 px-3 font-mono text-right num text-texto2">
                {(totalRecebidas / 6).toFixed(1)}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-texto flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-texto" />
                Enviadas (Bot + Consultor)
              </td>
              <td className="py-2 px-3 font-mono text-right num text-texto font-medium">
                {totalEnviadas}
              </td>
              <td className="py-2 px-3 font-mono text-right num text-texto2">
                {(totalEnviadas / 6).toFixed(1)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sparkline Sóbrio Sem Gradientes ou Brilhos */}
      <div className="border border-fio rounded-[6px] p-2 bg-sup">
        <div className="flex items-center justify-between text-[11px] text-texto2 mb-1 px-1">
          <span>Distribuição horária (hoje)</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[1px] bg-texto3" /> Recebidas
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[1.5px] bg-texto" /> Enviadas
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          className="w-full h-20"
          preserveAspectRatio="none"
          aria-label="Evolução horária de mensagens"
        >
          {/* Linha base */}
          <line
            x1={paddingX}
            y1={paddingY + chartH}
            x2={largura - paddingX}
            y2={paddingY + chartH}
            stroke="var(--v-fio)"
            strokeWidth="1"
          />

          {/* Curva Recebidas (linha fina) */}
          <path
            d={pathRecebidas}
            fill="none"
            stroke="var(--v-texto3)"
            strokeWidth="1.2"
          />

          {/* Curva Enviadas (linha contrastante) */}
          <path
            d={pathEnviadas}
            fill="none"
            stroke="var(--v-texto)"
            strokeWidth="1.6"
          />

          {/* Pontos discretos */}
          {pontos.map((p, i) => (
            <g key={p.hora}>
              <circle
                cx={getX(i)}
                cy={getY(p.enviadas)}
                r="2"
                fill="var(--v-texto)"
              />
            </g>
          ))}
        </svg>

        <div className="flex justify-between px-2 pt-1 text-[11px] font-mono text-texto3">
          {pontos.map((p) => (
            <span key={p.hora}>{p.hora}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
