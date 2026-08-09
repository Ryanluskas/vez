/* Log curto e datado. O consultor vai olhar esta janela pra saber se esta atendendo. */

function agora() {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

export const log = {
  info: (...partes) => console.log(`${agora()} ·`, ...partes),
  alerta: (...partes) => console.log(`${agora()} ! `, ...partes),
  erro: (...partes) => console.error(`${agora()} ✗`, ...partes),
  destaque: (...partes) => console.log(`\n${partes.join(" ")}\n`),
};
