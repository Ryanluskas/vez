/*
  Wordmark. "vez" em caixa baixa, tracking negativo, e um ponto jade.
  O ponto e a unica cor da marca — nao repetir em outro lugar.
*/
export function Wordmark({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <span
      className="font-display font-bold leading-none tracking-[-0.05em] text-texto select-none"
      style={{ fontSize: tamanho }}
    >
      vez<span className="text-jade">.</span>
    </span>
  );
}

/*
  Marca desenhada: tres traços de tamanhos diferentes, o de cima em jade.
  E a fila — quem chegou primeiro esta no topo e e o proximo a ser atendido.
*/
export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="7" className="fill-sup2" />
      <rect x="7" y="8" width="14" height="2.5" rx="1.25" className="fill-jade" />
      <rect x="7" y="13" width="10" height="2.5" rx="1.25" className="fill-texto3" />
      <rect x="7" y="18" width="6" height="2.5" rx="1.25" className="fill-texto3" />
    </svg>
  );
}
