import test from "node:test";
import assert from "node:assert/strict";
import { decidirFollowup, horarioDecente, MAXIMO_DE_FOLLOWUPS } from "../src/funil.js";

/*
  O follow-up é a única coisa deste produto que manda mensagem sozinha.
  Um erro aqui não é rascunho ruim: é o cliente do consultor recebendo
  cobrança de madrugada, ou quatro cobranças seguidas. Daí o teste.
*/

const HORA = 60 * 60 * 1000;
const MEIO_DIA = new Date("2026-08-10T15:00:00");

function conversa(extra = {}) {
  return {
    nome: "Josenete Reis",
    telefone: "5596984149398",
    etapa: "aguardando_documentos",
    estagio: "aguardando_bot",
    atender: true,
    seguir: true,
    followups_enviados: 0,
    ultimo_followup_em: null,
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 8 * HORA).toISOString(),
    ...extra,
  };
}

test("cobra quem sumiu esperando documento", () => {
  const d = decidirFollowup(conversa(), MEIO_DIA);
  assert.equal(d.seguir, true);
  assert.equal(d.tentativa, 1);
  assert.match(d.texto, /Josenete/);
  assert.match(d.texto, /documento/i);
});

test("não cobra antes da hora", () => {
  const cedo = conversa({
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 1 * HORA).toISOString(),
  });
  assert.equal(decidirFollowup(cedo, MEIO_DIA).seguir, false);
});

test("nunca fora do horário decente", () => {
  const madrugada = new Date("2026-08-10T04:00:00");
  assert.equal(horarioDecente(madrugada), false);
  assert.equal(decidirFollowup(conversa(), madrugada).seguir, false);

  const noite = new Date("2026-08-10T21:30:00");
  assert.equal(decidirFollowup(conversa(), noite).seguir, false);
});

test("para depois de três tentativas", () => {
  const esgotado = conversa({
    followups_enviados: MAXIMO_DE_FOLLOWUPS,
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 200 * HORA).toISOString(),
  });
  assert.equal(decidirFollowup(esgotado, MEIO_DIA).seguir, false);
});

test("espaça: a segunda cobrança não sai junto com a primeira", () => {
  const acabouDeCobrar = conversa({
    followups_enviados: 1,
    ultimo_followup_em: new Date(MEIO_DIA.getTime() - 1 * HORA).toISOString(),
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 50 * HORA).toISOString(),
  });
  assert.equal(decidirFollowup(acabouDeCobrar, MEIO_DIA).seguir, false);

  const jaEsperou = conversa({
    followups_enviados: 1,
    ultimo_followup_em: new Date(MEIO_DIA.getTime() - 30 * HORA).toISOString(),
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 50 * HORA).toISOString(),
  });
  assert.equal(decidirFollowup(jaEsperou, MEIO_DIA).seguir, true);
});

test("não cobra quem está esperando VOCÊ responder", () => {
  const naFila = conversa({ estagio: "aguardando_voce" });
  assert.equal(decidirFollowup(naFila, MEIO_DIA).seguir, false);

  const comRascunho = conversa({ estagio: "rascunho_pronto" });
  assert.equal(decidirFollowup(comRascunho, MEIO_DIA).seguir, false);
});

test("respeita silenciado e o interruptor de follow-up", () => {
  assert.equal(decidirFollowup(conversa({ atender: false }), MEIO_DIA).seguir, false);
  assert.equal(decidirFollowup(conversa({ seguir: false }), MEIO_DIA).seguir, false);
});

test("não cobra em etapa que não depende do cliente", () => {
  for (const etapa of ["em_analise", "fechado", "perdido", "documentos_recebidos"]) {
    assert.equal(
      decidirFollowup(conversa({ etapa }), MEIO_DIA).seguir,
      false,
      `cobrou em ${etapa}`
    );
  }
});

test("a terceira mensagem se despede em vez de insistir", () => {
  const ultima = conversa({
    followups_enviados: 2,
    ultimo_followup_em: new Date(MEIO_DIA.getTime() - 100 * HORA).toISOString(),
    ultima_recebida_em: new Date(MEIO_DIA.getTime() - 200 * HORA).toISOString(),
  });
  const d = decidirFollowup(ultima, MEIO_DIA);
  assert.equal(d.seguir, true);
  assert.equal(d.tentativa, 3);
  assert.match(d.texto, /guardad|quando quiser|s[óo] me chamar/i);
});
