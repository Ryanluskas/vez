import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

function agora() {
  return new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

function prefixo() {
  const store = storage.getStore();
  if (store?.correlationId) {
    return `${agora()} [${store.correlationId}]`;
  }
  return agora();
}

export const log = {
  info: (...partes) => console.log(`${prefixo()} ·`, ...partes),
  alerta: (...partes) => console.log(`${prefixo()} ! `, ...partes),
  erro: (...partes) => console.error(`${prefixo()} ✗`, ...partes),
  destaque: (...partes) => console.log(`\n${partes.join(" ")}\n`),
  comContexto: (contexto, fn) => storage.run(contexto, fn),
};
