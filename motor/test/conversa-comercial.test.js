import test from "node:test";
import assert from "node:assert/strict";
import {
  oQueEstaReferenciando,
  resolver,
  oQueJaSei,
  comoResponderSemTer,
  tirarOQueJaSei,
} from "../src/referencias.js";
import {
  ABORDAGEM_PADRAO,
  montarAbordagem,
  ehAbordagem,
  oQueAAbordagemEnsina,
  aceitouAAbordagem,
} from "../src/abordagem.js";
import { queFalta, montarPedido, prontoPara } from "../src/requisitos.js";
import { decidir, ACOES } from "../src/agente/decidir.js";
import { checarGatilhos } from "../src/gatilhos.js";
import { numerosDeRisco } from "../src/numeros.js";

/*
  ============================================================================
  UMA CONVERSA COMERCIAL, NÃO MENSAGENS ISOLADAS

  O que este arquivo protege nasceu de uma conversa real que deu errado:

    BOT:     Oi Ademar Elleres, aqui é o Ryan. Vi que seu contrato Santander
             tem margem pra reduzir a taxa e liberar um valor pra você…
    CLIENTE: Preciso saber se ainda libera pra mim
    BOT:     Você é aposentado do INSS ou servidor? Em qual banco está seu
             empréstimo?

  O bot perguntou o banco que ELE MESMO tinha citado, duas mensagens antes.
  Do lado do cliente isso não é "faltou um dado" — é não ter ninguém
  prestando atenção.

  Duas causas, e as duas estão cobertas aqui: o bot não aprendia com as
  próprias mensagens, e não entendia ponteiro pra trás ("aquele valor").
  ============================================================================
*/

/* Estado depois da abordagem: é o que a conversa real produz. */
function depoisDaAbordagem(extra = {}) {
  return {
    nome: "Ademar",
    banco: "Santander",
    objetivo: "reducao_taxa",
    origem: "prospeccao",
    etapa_comercial: "prospeccao",
    aguardando: "resposta_da_abordagem",
    coletado: {},
    perguntado: {},
    simulacao: {},
    ...extra,
  };
}

function retrato(memoria, mensagem) {
  const g = checarGatilhos(mensagem);
  return {
    conversa: { atender: true, estagio: "aguardando_bot", escalonamentos: 0 },
    memoria,
    classificacao: {
      categoria: g.travou ? "valor" : "duvida",
      precisaDoRyan: g.travou,
      motivo: g.motivo,
      decidiuNaRegra: g.travou,
    },
    ultimasMensagens: [],
  };
}

/* ================================================================
   1. A abordagem padrão
   ================================================================ */

test("1. a abordagem é a do Ryan, não um 'olá, tudo bem'", () => {
  const t = montarAbordagem({ nome: "Ademar", banco: "Santander" });

  assert.match(t, /aqui é o Ryan/);
  assert.match(t, /contrato Santander/);
  assert.match(t, /reduzir a taxa/);
  assert.match(t, /Posso te mandar a simulação\?/);
  // O que ela NUNCA pode virar.
  assert.equal(/pra eu entender melhor seu perfil/i.test(t), false);
});

test("1b. a abordagem não promete número", () => {
  const t = montarAbordagem({ nome: "Ademar", banco: "Santander" });
  assert.equal(numerosDeRisco(t).length, 0);
});

test("1c. o bot reconhece a própria abordagem", () => {
  assert.equal(ehAbordagem(montarAbordagem({ nome: "Ademar", banco: "Santander" })), true);
  assert.equal(ehAbordagem("Oi! Tudo bem?"), false);
  assert.equal(ehAbordagem("Bom dia, como posso ajudar?"), false);
});

test("1d. a abordagem ENSINA nome e banco — era isso que se perdia", () => {
  const fatos = oQueAAbordagemEnsina(
    montarAbordagem({ nome: "Ademar", banco: "Santander" })
  );

  assert.equal(fatos.nome, "Ademar");
  assert.equal(fatos.banco, "Santander");
  assert.equal(fatos.objetivo, "reducao_taxa");
});

/* ================================================================
   2-3. "Sim" e "quanto libera?"
   ================================================================ */

test("2. 'sim' depois da abordagem é aceite, não saudação solta", () => {
  for (const r of ["sim", "pode", "manda", "pode mandar", "quero", "claro"]) {
    assert.equal(aceitouAAbordagem(r), true, `"${r}"`);
  }
  assert.equal(aceitouAAbordagem("quanto libera?"), false);
});

test("3. 'quanto libera?' em prospecção vai pra VOCÊ, não vira interrogatório", () => {
  const d = decidir(retrato(depoisDaAbordagem(), "quanto libera pra mim?"));

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR, "ia perguntar convênio e banco de novo");
  assert.equal(d.tudoColetado, true, "em prospecção você já tem o que precisa");
});

/* ================================================================
   4-6. As referências
   ================================================================ */

test("4. 'você já me disse o valor' é afirmação, não pedido", () => {
  /*
    Separado de "aquele valor" porque leva a outra resposta. "Aquele
    valor" pergunta; "você já me disse o valor" AFIRMA que a resposta já
    foi dada. Quando não tenho o número, ele tem razão — e a resposta
    certa começa admitindo isso.
  */
  assert.equal(oQueEstaReferenciando("Você já me disse o valor"), "valor_ja_dito");
  assert.equal(oQueEstaReferenciando("você ja me disse o valor"), "valor_ja_dito");
  assert.equal(oQueEstaReferenciando("vc já me passou"), "valor_ja_dito");
});

test("5. 'aquele valor' aponta pra simulação", () => {
  for (const f of ["Aquele valor", "aquele valor mesmo", "o valor que você falou", "e a simulação?"]) {
    assert.equal(oQueEstaReferenciando(f), "simulacao", `"${f}"`);
  }
});

test("6. 'você já sabe' aponta pro que já foi informado", () => {
  for (const f of ["você já sabe", "eu já te disse", "como eu te falei", "já falei isso"]) {
    assert.equal(oQueEstaReferenciando(f), "ja_informado", `"${f}"`);
  }
});

test("6b. 'já mandei' aponta pro documento", () => {
  for (const f of ["já mandei", "já te mandei isso", "já enviei", "acabei de mandar"]) {
    assert.equal(oQueEstaReferenciando(f), "documento_enviado", `"${f}"`);
  }
});

test("6c. mensagem normal não aponta pra lugar nenhum", () => {
  for (const f of ["bom dia", "quanto tempo demora?", "sou do INSS"]) {
    assert.equal(oQueEstaReferenciando(f), null, `"${f}"`);
  }
});

/* ================================================================
   14-15. O valor: lembrar quando existe, nunca inventar
   ================================================================ */

test("14. lembra o valor quando ele existe na memória", () => {
  const comValor = depoisDaAbordagem({
    simulacao: { valor: "4200 em 12x de 380", de: "consultor", em: "2026-08-17T00:00:00Z" },
  });

  const r = resolver("Você já me disse o valor", comValor);

  assert.equal(r.alvo, "valor_ja_dito");
  assert.equal(r.tenho, true);
  assert.equal(r.simulacao.valor, "4200 em 12x de 380");
  assert.equal(r.de, "consultor", "sem procedência, o validador não teria contra o que conferir");
});

test("15. NÃO inventa o valor quando ele não existe", () => {
  const r = resolver("Aquele valor", depoisDaAbordagem());

  assert.equal(r.tenho, false);
  assert.equal(r.simulacao, undefined, "não pode existir valor de consolo");

  /*
    E o que sai NÃO é uma pergunta.

    Era: "você fala do que eu te passei antes, certo?". Do lado do
    cliente isso é mais um pedido pra ele repetir o que já disse — a
    reclamação que ele acabou de fazer. Agora o agente assume o próximo
    passo em vez de devolver o trabalho.
  */
  const resposta = comoResponderSemTer(r);
  assert.ok(resposta);
  assert.equal(numerosDeRisco(resposta).length, 0);
  assert.equal(/\?/.test(resposta), false, `voltou a perguntar: "${resposta}"`);
  assert.match(resposta, /confirmar|conferir/i, "não disse o que vai fazer");
  assert.equal(checarGatilhos(resposta).travou, false);
});

test("15a. quando ele diz que EU já passei, a resposta dá razão a ele", () => {
  const r = resolver("Você já me disse o valor", depoisDaAbordagem());
  assert.equal(r.tenho, false);

  const resposta = comoResponderSemTer(r);
  assert.match(resposta, /raz[ãa]o/i, "não reconheceu que o furo é meu");
  assert.equal(/\?/.test(resposta), false, `reperguntou: "${resposta}"`);
  assert.equal(numerosDeRisco(resposta).length, 0);
  assert.equal(checarGatilhos(resposta).travou, false);
});

test("15b. número sem procedência confiável conta como ausente", () => {
  /*
    Antes, a gravação recusava `de: "modelo"` e a LEITURA devolvia o que
    estivesse lá. Duas regras diferentes pro mesmo dado.

    Isso deixava um furo estreito e real: linha gravada por outro
    caminho, linha antiga de antes do campo `de`, campo que virou null
    numa migração. Em todos esses o número existe e ninguém sabe quem
    colocou — e o agente citava como se fosse seu.

    Agora a pergunta é a mesma nas duas pontas: de onde veio? Sem
    resposta, o número não existe.
  */
  for (const de of ["modelo", "cliente", null, undefined, ""]) {
    const suspeito = depoisDaAbordagem({ simulacao: { valor: "9999", de } });
    const r = resolver("aquele valor", suspeito);

    assert.equal(r.tenho, false, `aceitou número de origem "${de}"`);
    assert.equal(r.simulacao, undefined, `vazou o número de origem "${de}"`);

    // E o que sai no lugar não tem número nenhum.
    const resposta = comoResponderSemTer(r);
    assert.equal(numerosDeRisco(resposta).length, 0);
    assert.equal(/9999/.test(resposta), false);
  }
});

test("15c. as três fontes confiáveis passam", () => {
  for (const de of ["consultor", "lista", "ferramenta"]) {
    const r = resolver("aquele valor", depoisDaAbordagem({ simulacao: { valor: "4200", de } }));
    assert.equal(r.tenho, true, `recusou a fonte "${de}"`);
    assert.equal(r.de, de);
  }
});

/* ================================================================
   7-12. Não repetir pergunta, não pedir documento já recebido
   ================================================================ */

test("7. banco informado não é perguntado de novo", () => {
  const m = depoisDaAbordagem({ origem: "entrada", etapa_comercial: "interesse" });
  assert.equal(queFalta(m).includes("banco"), false, "ia perguntar o banco que já sabe");
});

test("8. benefício informado não é perguntado de novo", () => {
  const m = { origem: "entrada", etapa_comercial: "interesse", convenio: "inss", coletado: {}, perguntado: {} };
  assert.equal(queFalta(m).includes("convenio"), false);
});

test("11. o filtro final tira do pedido tudo que já sei", () => {
  const m = depoisDaAbordagem({ origem: "entrada", etapa_comercial: "interesse", convenio: "inss" });
  const pedido = { chaves: ["convenio", "banco", "contracheque"], texto: "..." };

  const filtrado = tirarOQueJaSei(pedido, m);

  assert.equal(filtrado.chaves.includes("convenio"), false, "convênio já era conhecido");
  assert.equal(filtrado.chaves.includes("banco"), false, "banco já era conhecido");
  assert.deepEqual(filtrado.chaves, ["contracheque"]);
  assert.equal(filtrado.filtrado, true);
});

test("11b. se o pedido inteiro já era conhecido, não sai pedido nenhum", () => {
  const m = depoisDaAbordagem({ convenio: "inss" });
  assert.equal(tirarOQueJaSei({ chaves: ["convenio", "banco"], texto: "..." }, m), null);
});

test("12. documento recebido não é pedido de novo", () => {
  const m = {
    origem: "entrada",
    etapa_comercial: "documentos",
    convenio: "inss",
    banco: "Santander",
    coletado: { contracheque: { confirmado: true } },
    perguntado: {},
  };

  assert.equal(queFalta(m).includes("contracheque"), false);
  assert.equal(montarPedido(m).chaves.includes("contracheque"), false);
});

/* ================================================================
   13. A etapa da negociação
   ================================================================ */

test("13. em prospecção o próximo passo é a simulação, não papel", () => {
  /*
    O consultor procurou aquela pessoa PORQUE já viu o contrato dela.
    Pedir contracheque logo depois de dizer "já analisei seu caso" faz o
    cliente concluir, com razão, que ninguém olhou nada.
  */
  const m = depoisDaAbordagem();

  assert.deepEqual(queFalta(m), [], "ia pedir documento antes de mostrar a simulação");
  assert.equal(montarPedido(m), null);
  assert.equal(prontoPara(m), true);
});

test("13b. depois da simulação, aí sim documento é o assunto", () => {
  const m = depoisDaAbordagem({ etapa_comercial: "documentos" });

  assert.ok(queFalta(m).length > 0, "depois da simulação, papel é o próximo passo");
  assert.ok(queFalta(m).includes("contracheque"));
});

test("13c. cliente que chegou sozinho continua sendo perguntado", () => {
  const m = { origem: "entrada", etapa_comercial: "interesse", coletado: {}, perguntado: {} };
  assert.deepEqual(queFalta(m), ["convenio", "banco", "contracheque", "margem"]);
});

/* ================================================================
   A CONVERSA DO ADEMAR, PASSO A PASSO
   ================================================================ */

test("a conversa que deu errado, agora inteira", () => {
  /*
    Cada passo confere o ESTADO, não só a resposta. É o estado que
    determina se a próxima mensagem vai fazer sentido.
  */

  /* --- BOT: a abordagem --- */
  const abordagem = montarAbordagem({ nome: "Ademar Elleres", banco: "Santander" });
  const aprendido = oQueAAbordagemEnsina(abordagem);

  let estado = {
    nome: aprendido.nome,
    banco: aprendido.banco,
    objetivo: aprendido.objetivo,
    origem: "prospeccao",
    etapa_comercial: "prospeccao",
    aguardando: "resposta_da_abordagem",
    coletado: {},
    perguntado: {},
    simulacao: {},
  };

  assert.equal(estado.nome, "Ademar", "o nome estava na abordagem e se perdia");
  assert.equal(estado.banco, "Santander", "o banco estava na abordagem e se perdia");

  /* --- CLIENTE: "Preciso saber se ainda libera pra mim" --- */
  const passo1 = "Preciso saber se ainda libera pra mim";

  assert.equal(checarGatilhos(passo1).travou, true, "é pergunta de dinheiro: vai pra você");

  const d1 = decidir(retrato(estado, passo1));
  assert.equal(
    d1.acao,
    ACOES.PEDIR_AO_CONSULTOR,
    "AQUI ERA O BUG: perguntava convênio e banco de novo"
  );
  assert.equal(d1.tudoColetado, true);

  /* --- VOCÊ responde na Fila, e isso vira estado --- */
  estado = {
    ...estado,
    simulacao: { valor: "4200 em 12x de 380", de: "consultor", em: new Date().toISOString() },
    etapa_comercial: "documentos",
  };

  /* --- CLIENTE: "Aquele valor" --- */
  const r2 = resolver("Aquele valor", estado);
  assert.equal(r2.alvo, "simulacao");
  assert.equal(r2.tenho, true, "ele cobrou o valor e o bot não sabia qual");
  assert.equal(r2.simulacao.valor, "4200 em 12x de 380");

  /* --- CLIENTE: "Você já me disse o valor" --- */
  const r3 = resolver("Você já me disse o valor", estado);
  assert.equal(r3.tenho, true);
  assert.equal(r3.de, "consultor", "o número tem procedência: o validador confere contra ela");

  /* --- CLIENTE: "Mas por quê? Você nem pediu isso" --- */
  const r4 = resolver("Mas por quê? Você nem pediu isso", estado);
  assert.equal(r4.alvo, "contesta_pedido");
  assert.equal(r4.tenho, true, "ele contesta e o bot precisa olhar o que tem antes de responder");

  const sei = r4.jaSei.map((s) => s.campo);
  assert.ok(sei.includes("banco"), "o banco tem que estar no que eu sei");
  assert.ok(sei.includes("simulacao"), "a simulação já passada tem que contar");

  /* --- E em nenhum momento o convênio foi perguntado de novo --- */
  assert.equal(
    tirarOQueJaSei({ chaves: ["banco"], texto: "em qual banco…" }, estado),
    null,
    "ia perguntar o banco pela terceira vez"
  );
});

/* ================================================================
   16-20. Continuidade
   ================================================================ */

test("16-17. mudar de assunto e voltar não apaga o estado", () => {
  const estado = depoisDaAbordagem({
    simulacao: { valor: "4200 em 12x de 380", de: "consultor" },
    etapa_comercial: "documentos",
  });

  // Muda de assunto: pergunta de prazo não referencia nada.
  assert.equal(oQueEstaReferenciando("quanto tempo demora pra cair?"), null);

  // Volta ao assunto: a simulação continua lá.
  const voltou = resolver("e aquele valor?", estado);
  assert.equal(voltou.tenho, true);
  assert.equal(voltou.simulacao.valor, "4200 em 12x de 380");
});

test("18-19. retomada horas ou dias depois lê o mesmo estado", () => {
  /*
    O estado mora no banco, não na memória do processo. Reiniciar o motor,
    virar o dia, trocar de máquina — o que ele sabe é o que está gravado.
  */
  const ontem = depoisDaAbordagem({
    simulacao: {
      valor: "4200 em 12x de 380",
      de: "consultor",
      em: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    },
    etapa_comercial: "documentos",
  });

  const r = resolver("você já me disse o valor", ontem);
  assert.equal(r.tenho, true, "o valor de ontem continua sendo o valor");
});

test("20. várias mensagens do mesmo cliente somam, não substituem", () => {
  let estado = { origem: "entrada", etapa_comercial: "interesse", coletado: {}, perguntado: {} };

  estado = { ...estado, convenio: "inss" };
  assert.equal(queFalta(estado).includes("convenio"), false);

  estado = { ...estado, banco: "Santander" };
  assert.equal(queFalta(estado).includes("banco"), false);
  assert.equal(queFalta(estado).includes("convenio"), false, "aprender o banco apagou o convênio");

  const sei = oQueJaSei(estado).map((s) => s.campo);
  assert.deepEqual(sei.sort(), ["banco", "convenio"]);
});

/* ================================================================
   O que não pode ceder
   ================================================================ */

test("nenhuma pergunta que amarra a referência tem número", () => {
  const semNada = depoisDaAbordagem();

  for (const frase of ["aquele valor", "já mandei", "você já sabe", "aquele contrato"]) {
    const r = resolver(frase, semNada);
    const p = comoResponderSemTer(r);
    if (!p) continue;

    assert.equal(numerosDeRisco(p).length, 0, `tem número: "${p}"`);
    assert.equal(checarGatilhos(p).travou, false, `cheira a dinheiro: "${p}"`);
  }
});

test("referência a valor NÃO libera o bot de chamar você", () => {
  /*
    Entender "aquele valor" não é o mesmo que poder responder sozinho. Sem
    o número no estado, isso continua sendo pergunta de dinheiro.
  */
  const d = decidir(retrato(depoisDaAbordagem(), "e aquele valor, quanto ficou?"));
  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR);
});

test("entradas estranhas não quebram a resolução", () => {
  for (const entrada of [null, undefined, "", "   ", "😀"]) {
    assert.doesNotThrow(() => oQueEstaReferenciando(entrada));
    assert.doesNotThrow(() => resolver(entrada, null));
    assert.doesNotThrow(() => oQueJaSei(null));
    assert.doesNotThrow(() => tirarOQueJaSei(null, null));
  }
});
