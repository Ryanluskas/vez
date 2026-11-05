import type { Metadata } from "next";
import { CabecalhoDeTela, Tela } from "@/components/ui/Tela";
import { PainelModelosIA } from "@/components/ia/PainelModelosIA";
import { obterConfigIA, obterConsumoIARecente } from "@/lib/dados";

export const metadata: Metadata = { title: "Modelos IA" };

export default async function PaginaDeIA() {
  const [config, { consumos, custoTotalHojeUsd }] = await Promise.all([
    obterConfigIA(),
    obterConsumoIARecente(30),
  ]);

  return (
    <Tela>
      <CabecalhoDeTela
        titulo="Modelos de Inteligência Artificial"
        linha="Gerencie provedores, arquitetura multiprovedor com fallback resiliente e acompanhe custos em tempo real."
        rotulo="Motor Multiprovedor"
      />

      <PainelModelosIA
        config={config}
        consumos={consumos}
        custoTotalHojeUsd={custoTotalHojeUsd}
      />
    </Tela>
  );
}
