import { FERRAMENTAS, validarArgumentos } from "./ferramentas.js";
import { tentar, ehPassageiro } from "../resiliencia.js";
import { EVENTOS, observadorMudo } from "../observar.js";
import { log } from "../log.js";

/*
  ============================================================================
  QUEM EXECUTA AS FERRAMENTAS

  O registro diz o que cada ferramenta faz. Este arquivo diz sob que
  condições ela roda — e essas condições existem porque o agente não é um
  script que roda uma vez: ele roda a cada mensagem, na máquina do
  consultor, sem ninguém olhando.

  Cinco proteções, todas por um motivo concreto:

    LIMITE       o modelo entra em ciclo e pede a mesma coisa sem parar. No
                 sexto pedido a resposta é "chega", e a conversa vai pra
                 fila em vez de travar.

    REPETIÇÃO    a mesma chamada com os mesmos argumentos no mesmo ciclo
                 devolve o primeiro resultado sem executar de novo. É o que
                 impede marcar duas vezes o mesmo documento — e, pior, abrir
                 duas pendências para o mesmo cliente.

    TEMPO        Supabase de graça hiberna. Sem corte, uma consulta pendurada
                 segura a mensagem do cliente por minutos e ele desiste.

    ERRO         ferramenta que quebra devolve `{ok:false}`. Nunca estoura
                 pra cima: o orquestrador tem um plano B (a fila), e ele só
                 funciona se o erro chegar como resposta, não como exceção.

    REGISTRO     tudo que rodou fica gravado, com argumentos e tempo. Sem
                 isso, "o bot fez besteira ontem" é impossível de investigar.
  ============================================================================
*/

export const LIMITE_DE_CHAMADAS = 6;
export const TEMPO_LIMITE_MS = 8_000;

function assinatura(nome, argumentos) {
  // Chaves ordenadas: {a,b} e {b,a} são a mesma chamada.
  const chaves = Object.keys(argumentos ?? {}).sort();
  return `${nome}(${chaves.map((k) => `${k}=${argumentos[k]}`).join(",")})`;
}

export function comTempoLimite(promessa, ms, nome) {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => {
      rejeitar(new Error(`${nome} passou de ${ms / 1000}s`));
    }, ms);

    Promise.resolve(promessa).then(
      (v) => {
        clearTimeout(relogio);
        resolver(v);
      },
      (e) => {
        clearTimeout(relogio);
        rejeitar(e);
      }
    );
  });
}

export function criarExecutor(contexto) {
  const { observador = observadorMudo() } = contexto ?? {};

  /* Grava o que rodou. Falha aqui não pode derrubar a ferramenta que deu
     certo — o diário é para depois, o atendimento é para agora. */
  function registrar(linha) {
    observador.registrar(EVENTOS.FERRAMENTA, linha);
  }

  /*
    Um ciclo por mensagem recebida. O limite e a memória de repetição valem
    dentro do ciclo — duas mensagens do mesmo cliente são dois ciclos, e a
    segunda pode legitimamente refazer o que a primeira fez.
  */
  function novoCiclo({ idConversa = null, quem = null } = {}) {
    const feitas = new Map();
    const registro = [];

    async function usar(nome, argumentos = {}) {
      const definicao = FERRAMENTAS[nome];

      /* Nome que não existe. Vem do modelo alucinando uma ferramenta. */
      if (!definicao) {
        log.alerta(`Ferramenta inexistente pedida: ${nome}`);
        return { ok: false, erro: `não existe ferramenta chamada "${nome}"` };
      }

      const conferido = validarArgumentos(definicao, argumentos);
      if (!conferido.ok) {
        const porque = conferido.problemas.join("; ");
        log.alerta(`${nome} recusada: ${porque}`);
        registrar({
          idConversa,
          ferramenta: nome,
          argumentos,
          ok: false,
          detalhe: `recusada: ${porque}`,
        });
        return { ok: false, erro: porque, recusada: true };
      }

      const chave = assinatura(nome, conferido.argumentos);

      /*
        Já rodou neste ciclo. Devolve o mesmo resultado em vez de executar
        de novo: se foi uma escrita, executar duas vezes seria o acidente
        que a proteção existe pra evitar.
      */
      if (feitas.has(chave)) {
        return { ...feitas.get(chave), repetida: true };
      }

      if (feitas.size >= LIMITE_DE_CHAMADAS) {
        log.alerta(`Limite de ${LIMITE_DE_CHAMADAS} ferramentas no ciclo; parei em ${nome}.`);
        return {
          ok: false,
          erro: `já usei ${LIMITE_DE_CHAMADAS} ferramentas nesta mensagem`,
          limite: true,
        };
      }

      const comecou = Date.now();

      /*
        Leitura pode ser retentada à vontade: ler duas vezes dá o mesmo
        resultado. ESCRITA NÃO — a ferramenta pode ter chegado a gravar
        antes de o erro aparecer, e a segunda tentativa gravaria de novo.
        Uma pendência duplicada é pior que um erro reportado.
      */
      const podeRepetir = definicao.escrita !== true;

      const r = await tentar(
        () => comTempoLimite(definicao.executar(conferido.argumentos, contexto), TEMPO_LIMITE_MS, nome),
        {
          nome,
          tentativas: podeRepetir ? 2 : 1,
          passageiro: podeRepetir ? ehPassageiro : () => false,
          silencioso: true,
        }
      );

      const resultado = r.ok ? { ok: true, dados: r.valor } : { ok: false, erro: r.erro };
      const ms = Date.now() - comecou;

      if (!resultado.ok) log.erro(`${nome}: ${resultado.erro}`);

      feitas.set(chave, resultado);
      registro.push({ nome, argumentos: conferido.argumentos, ok: resultado.ok, ms });

      log.info(
        `   ${resultado.ok ? "✓" : "✗"} ${nome} (${ms}ms)` +
          (resultado.ok ? "" : ` — ${resultado.erro}`)
      );

      registrar({
        idConversa,
        ferramenta: nome,
        argumentos: conferido.argumentos,
        ok: resultado.ok,
        detalhe: resultado.ok ? nome : resultado.erro,
        ms,
      });

      return resultado;
    }

    /*
      Roda uma lista na ordem. Usado pelo plano que o modelo propõe: ele
      pede várias leituras de uma vez e o executor aplica as mesmas regras
      a cada uma.
    */
    async function usarVarias(chamadas) {
      const saidas = [];
      for (const c of chamadas ?? []) {
        saidas.push({ nome: c.nome, ...(await usar(c.nome, c.argumentos)) });
      }
      return saidas;
    }

    return {
      usar,
      usarVarias,
      quem,
      /* O que rodou neste ciclo — pro log do orquestrador e pros testes. */
      registro: () => [...registro],
      quantas: () => feitas.size,
    };
  }

  return { novoCiclo };
}
