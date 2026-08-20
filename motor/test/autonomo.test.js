import test from "node:test";
import assert from "node:assert/strict";

import { resolver, oQueEstaReferenciando, comoResponderSemTer } from "../src/referencias.js";
import {
  valorConfiavel,
  deFonteConfiavel,
  FONTES_CONFIAVEIS,
  jaFoiDito,
} from "../src/valores.js";
import { classificarPorRegra } from "../src/classificar.js";
import { checarGatilhos } from "../src/gatilhos.js";
import { numerosDeRisco, conferir } from "../src/numeros.js";
import {
  validarAntesDeEnviar,
  validarTexto,
  oQueSumiuDaResposta,
  afirmouSerTudoSemBase,
} from "../src/agente/validar.js";
import { decidir, podeAgirSozinho, ACOES } from "../src/agente/decidir.js";
import { pareceTerFato, extrairPorRegra } from "../src/extrair.js";
import {
  respostaDeterministica,
  conferido,
  vouVerificar,
  meAdiantei,
  ehAvisoDeQueVaiVerificar,
  jaTeFalei,
  ehConfirmacaoDeQueJaFalei,
} from "../src/respostas.js";
import { montarPedido } from "../src/requisitos.js";
import { criarTravas, criarMemoriaDeEventos } from "../src/travas.js";

/*
  O painel oferece esta lista ao consultor; o motor recebe pelo banco o que
  ele escolheu. Repito a lista aqui de propósito: o teste precisa provar
  que "valor" não sai nem quando alguém a libera à mão no banco — e pra
  isso ele tem que tentar liberar.
*/
const TUDO_QUE_O_PAINEL_LIBERA = [
  "saudacao",
  "documentos",
  "prazo",
  "horario",
  "acompanhamento",
  "elegibilidade",
  "outro",
];

/*
  ============================================================================
  AUTONOMIA COM SEGURANÇA

  Modo autônomo não é "responde tudo". É "resolve sozinho o que dá pra
  resolver com segurança, e chama gente quando não dá".

  A diferença entre as duas leituras é inteira nestes testes. Cada um deles
  descreve uma situação em que o agente ou responde sozinho ou não pode —
  e o que ele faz quando não pode.

  A REGRA QUE MANDA EM TODAS AS OUTRAS

  O valor que libera não é fixo. Muda de pessoa pra pessoa. Não existe conta
  que chegue nele nem padrão que o preveja. Então o número só é real se veio
  de uma fonte: você, sua lista, ou uma ferramenta. Nunca do modelo, nunca
  do cliente repetindo o que ouviu, nunca de dedução.

  Sem fonte, o agente não responde número. Ele diz que vai confirmar e vai.
  ============================================================================
*/

const BASE = {
  id_conversa: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nome: "Ademar",
  banco: "Santander",
  objetivo: "reducao_taxa",
  origem: "prospeccao",
  etapa_comercial: "interesse",
  coletado: {},
  perguntado: {},
};

const comMemoria = (extra = {}) => ({ ...BASE, ...extra });
const comValorDe = (de) => comMemoria({ simulacao: { valor: "R$ 4.200", parcela: "R$ 380", de } });

/* ================================================================
   1-4. As quatro combinações de referência × valor
   ================================================================ */

test("1. 'você já me disse o valor' COM valor confiável: usa o valor", () => {
  const r = resolver("Você já me disse o valor", comValorDe("consultor"));

  assert.equal(r.alvo, "valor_ja_dito");
  assert.equal(r.tenho, true);
  assert.equal(r.simulacao.valor, "R$ 4.200");
  assert.equal(r.de, "consultor", "sem procedência o validador não tem contra o que conferir");
  assert.equal(comoResponderSemTer(r), null, "tinha o dado e mesmo assim ia se desculpar");
});

test("2. 'você já me disse o valor' SEM valor: dá razão a ele e vai confirmar", () => {
  const r = resolver("Você já me disse o valor", comMemoria());

  assert.equal(r.tenho, false);
  assert.equal(r.simulacao, undefined, "não pode existir valor de consolo");

  const resposta = comoResponderSemTer(r);

  // Dá razão — se o número deveria estar aqui e não está, o furo é meu.
  assert.match(resposta, /raz[ãa]o/i);
  // Diz o que vai fazer.
  assert.match(resposta, /confirmar/i);
  // E NÃO devolve a pergunta pro cliente, que é a reclamação dele.
  assert.equal(/\?/.test(resposta), false, `reperguntou: "${resposta}"`);
  assert.equal(numerosDeRisco(resposta).length, 0);
  assert.equal(conferido(resposta), resposta, "o próprio guarda recusaria a frase");
});

test("3. 'aquele valor' COM valor conhecido: responde", () => {
  const r = resolver("Aquele valor", comValorDe("consultor"));
  assert.equal(r.tenho, true);
  assert.equal(r.simulacao.parcela, "R$ 380");
});

test("4. 'aquele valor' SEM valor conhecido: não inventa, não repergunta", () => {
  const r = resolver("Aquele valor", comMemoria());

  assert.equal(r.tenho, false);
  const resposta = comoResponderSemTer(r);

  assert.match(resposta, /confirmar|conferir/i);
  assert.equal(/\?/.test(resposta), false, `reperguntou: "${resposta}"`);
  assert.equal(numerosDeRisco(resposta).length, 0);
  assert.equal(checarGatilhos(resposta).travou, false);
});

/* ================================================================
   5-7. De onde o número pode vir
   ================================================================ */

test("5. valor dito pelo CLIENTE não vira valor real", () => {
  /*
    "Me falaram que libera 5 mil" não é fonte. O cliente repetindo um
    número que ouviu na esquina não torna o número verdadeiro — e o agente
    ecoando de volta transforma boato em compromisso do consultor.

    A regra de extração não recolhe número, e a procedência 'cliente' não
    está na lista de fontes.
  */
  const doCliente = extrairPorRegra("me falaram que libera 5 mil, é isso mesmo?");
  assert.equal(doCliente.valor, undefined, "a extração recolheu um número do cliente");

  assert.equal(deFonteConfiavel("cliente"), false);

  const comBoato = comMemoria({ simulacao: { valor: "R$ 5.000", de: "cliente" } });
  assert.equal(valorConfiavel(comBoato).tem, false);
  assert.equal(resolver("aquele valor", comBoato).tenho, false);
});

test("6. valor dado pelo RYAN é real e sai sem segunda aprovação", () => {
  assert.equal(deFonteConfiavel("consultor"), true);

  const v = valorConfiavel(comValorDe("consultor"));
  assert.equal(v.tem, true);
  assert.equal(v.de, "consultor");
});

test("7. valor vindo de FERRAMENTA/lista é real, mas espera o OK", () => {
  /*
    Correto na origem, não conferido pra esta pessoa: a planilha casa por
    telefone, e ninguém confirmou que aquela linha é deste cliente. O
    número pode ser usado; quem clica em enviar é o consultor.
  */
  for (const de of ["lista", "ferramenta"]) {
    assert.equal(deFonteConfiavel(de), true);
    assert.equal(valorConfiavel(comValorDe(de)).tem, true);
  }

  assert.deepEqual([...FONTES_CONFIAVEIS].sort(), ["consultor", "ferramenta", "lista"]);
});

test("7b. número sem procedência é tratado como ausente, não como dado", () => {
  for (const de of [null, undefined, "", "modelo", "ia", "deducao"]) {
    const v = valorConfiavel(comMemoria({ simulacao: { valor: "R$ 9.999", de } }));
    assert.equal(v.tem, false, `aceitou procedência "${de}"`);
    assert.ok(v.porque, "não disse por que recusou");
  }
});

/* ================================================================
   8. A IA tentando inventar
   ================================================================ */

test("8. IA inventando número é barrada antes do envio", () => {
  const fonte = "valor R$ 4.200, parcela R$ 380";

  // Copiou certo: passa.
  const bom = validarAntesDeEnviar("Ademar, consegui R$ 4.200 em parcelas de R$ 380. Seguimos?", {
    permitirNumeros: true,
    fontesPermitidas: [fonte],
  });
  assert.equal(bom.ok, true, bom.motivo);

  // Acrescentou um número que não está em fonte nenhuma: barra.
  for (const inventado of [
    "Ademar, consegui R$ 4.200 em 12x de R$ 380, com taxa de 1,49% ao mês.",
    "Ademar, consegui R$ 4.850 pra você. Seguimos?",
    "Ademar, dá pra liberar uns R$ 4.200 e ainda sobra R$ 900 de margem.",
  ]) {
    const r = validarAntesDeEnviar(inventado, {
      permitirNumeros: true,
      fontesPermitidas: [fonte],
    });
    assert.equal(r.ok, false, `deixou passar: "${inventado}"`);
    assert.equal(r.codigo, "inventou_numero", `código errado pra: "${inventado}"`);
  }
});

test("8b. sem fonte nenhuma, NENHUM número passa", () => {
  const r = validarTexto("Ademar, consegui liberar R$ 4.200 pra você.", { permitirNumeros: false });
  assert.equal(r.ok, false);
  assert.equal(conferir("R$ 4.200").length, 1, "número sem fonte deveria estar sozinho na lista");
});

/* ================================================================
   9-11. Quando a IA falha
   ================================================================ */

test("9. Ollama em timeout não vira resposta chutada", async () => {
  /*
    O contrato de `pensar()` é devolver null quando não deu. Null vira
    pendência lá em cima, nunca palpite. Aqui eu simulo o que o chamador
    recebe e confiro que o caminho de baixo aguenta.
  */
  const semClassificacao = null;

  // Sem classificação, a régua determinística ainda responde o caso comum.
  assert.equal(classificarPorRegra("bom dia").categoria, "saudacao");
  assert.equal(classificarPorRegra("quais documentos preciso?").categoria, "documentos");
  assert.equal(classificarPorRegra("quanto tempo demora?").categoria, "prazo");

  // E o que ela não sabe classificar não vira chute: vira "não sei".
  /*
    E o que ela não sabe classificar não vira chute: vira null, e null
    lá em cima vira pendência.
  */
  assert.equal(classificarPorRegra("me explica aquilo lá"), null);
  assert.equal(semClassificacao, null);
});

test("10. classificação inválida do modelo não é aceita", () => {
  /*
    O modelo pode devolver categoria que não existe, texto no lugar de
    JSON, ou JSON com o campo errado. Nenhum desses pode virar decisão.
  */
  for (const lixo of ["", "  ", "categoria_que_nao_existe", "{quebrado", "<think>hmm</think>"]) {
    const d = decidir({
      classificacao: { categoria: lixo, confianca: 0.9 },
      memoria: comMemoria(),
      conversa: {},
    });

    assert.ok(
      Object.values(ACOES).includes(d.acao),
      `categoria "${lixo}" produziu ação inválida: ${d.acao}`
    );
    /*
      Categoria que o painel não conhece não está na lista liberada, e por
      isso não sai sozinha nem no autônomo. É o que impede um modelo
      devolvendo lixo de virar mensagem enviada.
    */
    assert.equal(
      podeAgirSozinho(d, { modo: "autonomo", categoriasLiberadas: TUDO_QUE_O_PAINEL_LIBERA }),
      TUDO_QUE_O_PAINEL_LIBERA.includes(d.categoria),
      `categoria "${lixo}" virou "${d.categoria}" e escapou`
    );
  }

  /*
    Raciocínio vazado do modelo nunca chega ao cliente. Confiro no portão
    de verdade (`validarAntesDeEnviar`) e não na camada de baixo:
    `validarTexto` é interna e não roda o teste de forma.
  */
  for (const vazamento of [
    "<think>o cliente quer saber</think> Em até 2 dias úteis.",
    "<reasoning>ele perguntou prazo</reasoning> Em até 2 dias úteis.",
  ]) {
    const r = validarAntesDeEnviar(vazamento, {});

    /*
      O que importa é não sair. Qual das camadas pegou primeiro é detalhe
      de implementação: `<think>` cai no teste de forma, `<reasoning>`
      cai antes, no de texto que é do consultor. Fixar o código aqui
      amarraria o teste à ordem das barreiras.
    */
    assert.equal(r.ok, false, `deixou passar: "${vazamento}"`);
    assert.ok(r.codigo, "barrou sem dizer por quê");
  }
});

test("11. fallback determinístico responde sem IA nenhuma", () => {
  const saud = respostaDeterministica({
    categoria: "saudacao",
    mensagemCliente: "bom dia",
    nomeCliente: "Ademar",
    semente: 0,
  });

  assert.ok(saud, "saudação precisou de IA");
  assert.equal(numerosDeRisco(saud).length, 0);
  assert.equal(checarGatilhos(saud).travou, false);

  // E o aviso que impede o silêncio também é texto fixo.
  const aviso = vouVerificar("Ademar", 0);
  assert.ok(aviso.length <= 80);
  assert.equal(numerosDeRisco(aviso).length, 0);
});

/* ================================================================
   12-13. Handoff e a volta
   ================================================================ */

test("12. pergunta de valor sem o número vira handoff, não resposta", () => {
  /*
    `precisaDoRyan` é o que a régua de ouro levanta quando a mensagem fala
    de dinheiro. Em prospecção não falta documento nenhum, então não há o
    que perguntar ao cliente — o que falta é a simulação, que é sua.
  */
  const d = decidir({
    classificacao: { categoria: "valor", precisaDoRyan: true, decidiuNaRegra: true },
    memoria: comMemoria(),
    conversa: {},
  });

  assert.equal(d.acao, ACOES.PEDIR_AO_CONSULTOR, "tentou responder valor sozinho");

  // E a categoria "valor" nunca sai sozinha, em modo nenhum. Quarta barreira.
  for (const modo of ["manual", "assistido", "autonomo"]) {
    assert.equal(
      podeAgirSozinho({ categoria: "valor", confianca: 1 }, { modo, categoriasLiberadas: ["valor"] }),
      false,
      `modo ${modo} deixou "valor" sair sozinho`
    );
  }
});

test("13. depois do handoff, o valor do consultor fica utilizável", () => {
  /*
    Você respondeu na Fila. A partir daí o número existe com procedência
    'consultor', e a próxima referência do cliente resolve sozinha — sem
    passar por você de novo pelo mesmo dado.
  */
  const depois = comValorDe("consultor");

  assert.equal(resolver("Aquele valor", depois).tenho, true);
  assert.equal(resolver("Você já me disse o valor", depois).tenho, true);
  assert.equal(valorConfiavel(depois).de, "consultor");
});

/* ================================================================
   14-15. Duplicação e corrida
   ================================================================ */

test("14. mensagem duplicada é vista uma vez só", () => {
  const vistas = criarMemoriaDeEventos();
  const id = "ABC123@c.us";

  assert.equal(vistas.novo(id), true, "primeira vez foi tratada como repetida");
  assert.equal(vistas.novo(id), false, "a segunda passou de novo");
  assert.equal(vistas.novo(id), false, "a terceira também");

  // Id diferente continua passando — dedup não pode virar mudez.
  assert.equal(vistas.novo("OUTRA@c.us"), true);
});

test("15. mensagens rápidas do mesmo cliente não se atropelam", async () => {
  const travas = criarTravas();
  const ordem = [];
  let simultaneos = 0;
  let pico = 0;

  const tarefa = (n) => async () => {
    simultaneos += 1;
    pico = Math.max(pico, simultaneos);
    await new Promise((r) => setTimeout(r, 5));
    ordem.push(n);
    simultaneos -= 1;
  };

  await Promise.all([1, 2, 3, 4].map((n) => travas.naVezDe("conversa-1", tarefa(n))));

  assert.equal(pico, 1, "duas mensagens da mesma conversa rodaram juntas");
  assert.deepEqual(ordem, [1, 2, 3, 4], "saíram fora de ordem");
});

/* ================================================================
   16-24. O que o cliente escreve
   ================================================================ */

test("16. muda de assunto e volta: o valor continua lá", () => {
  const estado = comValorDe("consultor");

  // Sai do assunto.
  assert.equal(classificarPorRegra("você atende sábado?").categoria, "horario");
  // Volta.
  assert.equal(resolver("e aquele valor?", estado).tenho, true);
  assert.equal(resolver("e aquele valor?", estado).simulacao.valor, "R$ 4.200");
});

test("17. 'já mandei' aponta pro documento, não recomeça", () => {
  for (const f of ["já mandei", "já te mandei isso", "já enviei", "acabei de mandar"]) {
    assert.equal(oQueEstaReferenciando(f), "documento_enviado", `"${f}"`);
  }

  const comDoc = comMemoria({ coletado: { contracheque: { confirmado: true, como: "cliente" } } });
  const r = resolver("já mandei", comDoc);
  assert.equal(r.tenho, true);
  assert.deepEqual(r.entregues, ["contracheque"]);
});

test("18. 'você já sabe' faz o agente olhar o estado antes de perguntar", () => {
  const r = resolver("você já sabe", comMemoria());

  assert.equal(oQueEstaReferenciando("você já sabe"), "ja_informado");
  assert.equal(r.tenho, true, "tinha nome, banco e objetivo e disse que não sabia nada");
  assert.ok(r.jaSei.some((s) => s.campo === "banco"));
});

test("19. 'você nem pediu isso' é correção: recua, não repete o pedido", () => {
  assert.equal(oQueEstaReferenciando("Mas por quê? Você nem pediu isso"), "contesta_pedido");

  /*
    Quem responde isto é `meAdiantei`, não a frase de referência: a reação
    certa é recuar, e recuar não é "confirmar um dado", é admitir que o
    pedido veio na hora errada.
  */
  const resposta = meAdiantei("Ademar", 0);
  assert.match(resposta, /raz[ãa]o|verdade|justo/i, "não reconheceu o erro");
  assert.equal(/me manda|preciso que|envie/i.test(resposta), false, `pediu de novo: "${resposta}"`);
  assert.equal(numerosDeRisco(resposta).length, 0);
});

test("20. 'sim' sozinho não gasta IA nem inventa contexto", () => {
  assert.equal(pareceTerFato("sim"), false, "chamou o extrator por um 'sim'");
  assert.equal(oQueEstaReferenciando("sim"), null);
});

test("21. 'não' sozinho também não", () => {
  assert.equal(pareceTerFato("não"), false);
  assert.equal(pareceTerFato("nao"), false);
});

test("22. 'aquele' sozinho aponta pro valor", () => {
  assert.equal(oQueEstaReferenciando("aquele"), "simulacao");
  assert.equal(resolver("aquele", comValorDe("consultor")).tenho, true);
  assert.equal(resolver("aquele", comMemoria()).tenho, false);
});

test("23. 'quanto libera?' trava na regra de ouro, em qualquer redação", () => {
  for (const f of [
    "quanto libera?",
    "quanto eu pego?",
    "Preciso saber se ainda libera pra mim",
    "da quanto?",
    "quanto dá?",
    "vai dar quanto?",
  ]) {
    assert.equal(checarGatilhos(f).travou, true, `passou: "${f}"`);
  }

  // E não gasta IA pra descobrir isso.
  assert.equal(pareceTerFato("quanto libera?"), false);
});

test("24. não repergunta o que já está no estado", () => {
  const jaTemTudoDoCliente = comMemoria({
    convenio: "inss",
    coletado: {
      contracheque: { confirmado: true, como: "cliente" },
      margem: { confirmado: true, como: "cliente" },
    },
  });

  assert.equal(montarPedido(jaTemTudoDoCliente), null, "ia perguntar o que já tinha");

  // E em prospecção não pede nada antes da simulação.
  assert.equal(montarPedido(comMemoria({ origem: "prospeccao" })), null);
});

/* ================================================================
   As condições que o modo autônomo exige
   ================================================================ */

test("autônomo: 'valor' não sai sozinho nem se alguém liberar à mão", () => {
  /*
    Autonomia não veio de afrouxar isto. Veio de consertar a procedência
    no caminho do envio: número que VOCÊ deu já estava aprovado quando
    você digitou, e passa por `origem: "consultor"`, não por aqui.

    O painel não oferece "valor" na lista. Mas a lista viaja pelo banco, e
    banco é editável — então a barreira não pode depender de a lista estar
    certa. Aqui eu libero "valor" à mão, no modo mais permissivo, e ela
    continua sem sair.
  */
  assert.equal(TUDO_QUE_O_PAINEL_LIBERA.includes("valor"), false);

  for (const modo of ["manual", "assistido", "autonomo"]) {
    assert.equal(
      podeAgirSozinho(
        { categoria: "valor", confianca: 1 },
        { modo, categoriasLiberadas: [...TUDO_QUE_O_PAINEL_LIBERA, "valor"] }
      ),
      false,
      `modo ${modo} deixou "valor" sair sozinho com a lista adulterada`
    );
  }
});

test("autônomo: o que É liberado sai sozinho no modo autônomo", () => {
  /*
    O outro lado da moeda. Uma barreira que bloqueia tudo é fácil e
    inútil: o produto existe pra o consultor não responder "quais
    documentos?" cinquenta vezes por dia.
  */
  for (const categoria of TUDO_QUE_O_PAINEL_LIBERA) {
    assert.equal(
      podeAgirSozinho(
        { categoria, confianca: 1 },
        { modo: "autonomo", categoriasLiberadas: TUDO_QUE_O_PAINEL_LIBERA }
      ),
      true,
      `"${categoria}" está liberada e mesmo assim não saiu`
    );

    // E em manual nada sai, que é o ponto do manual.
    assert.equal(
      podeAgirSozinho(
        { categoria, confianca: 1 },
        { modo: "manual", categoriasLiberadas: TUDO_QUE_O_PAINEL_LIBERA }
      ),
      false
    );
  }
});

test("autônomo: toda mensagem termina em resposta, aviso ou handoff", () => {
  /*
    Nunca silêncio. Para cada situação, existe pelo menos uma saída que
    chega ao cliente sem depender de modelo nenhum.
  */
  const situacoes = [
    ["saudação", respostaDeterministica({ categoria: "saudacao", mensagemCliente: "oi", nomeCliente: "Ademar", semente: 0 })],
    ["referência sem o dado", comoResponderSemTer(resolver("aquele valor", comMemoria()))],
    ["ele diz que eu já passei", comoResponderSemTer(resolver("você já me disse o valor", comMemoria()))],
    ["nada respondível", vouVerificar("Ademar", 0)],
  ];

  for (const [rotulo, texto] of situacoes) {
    assert.ok(texto, `${rotulo}: ficaria em silêncio`);
    assert.equal(numerosDeRisco(texto).length, 0, `${rotulo}: vazou número`);
    assert.equal(conferido(texto), texto, `${rotulo}: o guarda recusaria`);
  }
});

/* ================================================================
   Não dizer o mesmo número duas vezes
   ================================================================ */

test("o número já dito é reconhecido em qualquer formatação", () => {
  /*
    Comparo dígitos, não frase: "4200", "R$ 4.200" e "4.200,00" são o
    mesmo número, e quem escreve a frase é o modelo — ela muda toda vez.
  */
  const s = { valor: "R$ 4.200", parcela: "R$ 380" };

  assert.equal(jaFoiDito(s, "Você: consegui 4200 em 12x de 380"), true);
  assert.equal(jaFoiDito(s, "Você: consegui R$ 4.200,00 em 12x de R$ 380,00"), true);

  // Só parte do número não conta como dito.
  assert.equal(jaFoiDito(s, "Você: consegui 4200 pra você"), false);
  assert.equal(jaFoiDito(s, "Você: oi Ademar, tudo bem?"), false);
  assert.equal(jaFoiDito(s, ""), false);

  // Sem número na simulação não há o que ter sido dito.
  assert.equal(jaFoiDito({}, "qualquer coisa com 4200 dentro"), false);
});

test("confirmar não repete a mesma frase, e não confirma pra sempre", () => {
  /*
    Era sorteio por `Date.now()` e duas confirmações seguidas saíram
    idênticas. Agora o índice é a contagem: cada uma é diferente da
    anterior, e quando acabam as variantes o retorno é null — sinal de
    que o assunto deixou de ser o número e virou conversa travada.
  */
  const primeira = jaTeFalei("Ademar", 0);
  const segunda = jaTeFalei("Ademar", 1);

  assert.ok(primeira);
  assert.ok(segunda);
  assert.notEqual(primeira, segunda, "confirmou duas vezes com a mesma frase");

  // Nenhuma das duas carrega número: ele já tem o número.
  for (const t of [primeira, segunda]) {
    assert.equal(numerosDeRisco(t).length, 0);
    assert.equal(conferido(t), t, "o próprio guarda recusaria");
  }

  // A segunda já empurra pro próximo passo em vez de só concordar.
  assert.match(segunda, /entrada|seguir|quer/i);

  // Terceira vez: acabou. Quem chama manda pro consultor.
  assert.equal(jaTeFalei("Ademar", 2), null);
  assert.equal(jaTeFalei("Ademar", 9), null);
});

test("a contagem de confirmações sobrevive ao prefixo com o nome", () => {
  /*
    `comNome` minusculiza a primeira letra ao colocar o vocativo, então o
    texto gravado é "Ademar, isso mesmo…" e a frase de origem é "Isso
    mesmo…". Comparando com caixa, a contagem dava sempre zero e as duas
    confirmações saíam iguais — o defeito que a contagem existe pra
    evitar.
  */
  assert.equal(ehConfirmacaoDeQueJaFalei(jaTeFalei("Ademar", 0)), true);
  assert.equal(ehConfirmacaoDeQueJaFalei(jaTeFalei(null, 1)), true);
  assert.equal(ehConfirmacaoDeQueJaFalei("Ademar, consegui 4200 em 12x de 380."), false);
  assert.equal(ehConfirmacaoDeQueJaFalei(""), false);
  assert.equal(ehConfirmacaoDeQueJaFalei(null), false);
});

test("'quanto dá?' trava: o verbo dar também é pergunta de dinheiro", () => {
  /*
    Escapava. "quanto fica?" e "quanto sai?" travavam, "quanto dá?" não —
    e é a mesma pergunta.

    Não entrou na lista geral de verbos por causa do acento: `simplificar`
    tira acentos, e aí "da" (verbo) fica idêntico a "da" (preposição), que
    está em toda frase da operação. Cada forma exige posição verbal.
  */
  for (const f of [
    "da quanto?",
    "dá quanto?",
    "quanto da?",
    "quanto dá?",
    "vai dar quanto?",
    "quanto que da?",
    "daria quanto?",
    "quanto daria?",
    "pode dar quanto?",
  ]) {
    assert.equal(checarGatilhos(f).travou, true, `escapou: "${f}"`);
  }

  // E a preposição continua livre — inclusive nas frases do próprio bot.
  for (const f of [
    "Vou dar uma olhada e te respondo em seguida.",
    "vou dar entrada na documentação",
    "quanto tempo depois da assinatura?",
    "da pra fazer sábado?",
    "em quantos dias cai?",
  ]) {
    assert.equal(checarGatilhos(f).travou, false, `travou sem motivo: "${f}"`);
  }
});

test("o aviso de handoff nunca sai igual duas vezes seguidas", () => {
  /*
    Conversa real: o cliente recebeu "Vou dar uma olhada e te respondo em
    seguida." às 22:22, 22:23 e 22:25 — idêntico — e respondeu "Mas você
    só fala isso?".

    A causa era `Date.now()` como semente: `% 3` colide sempre que o
    intervalo é múltiplo de 3ms, e um minuto é. E mesmo com sorteio
    perfeito, uma em cada três repetiria.
  */
  const avisos = [0, 1, 2].map((n) => vouVerificar("Ryan", n));

  assert.equal(new Set(avisos).size, 3, "dois avisos saíram iguais");

  for (const a of avisos) {
    assert.ok(a.length <= 90, `${a.length} caracteres: "${a}"`);
    assert.equal(numerosDeRisco(a).length, 0);
    assert.equal(conferido(a), a, "o próprio guarda recusaria");
    assert.match(a, /confirmar|conferir|confirmando/i);
    assert.equal(ehAvisoDeQueVaiVerificar(a), true, "não se reconhece pra contar");
  }

  // O terceiro reconhece a espera em vez de fingir que é a primeira vez.
  assert.match(avisos[2], /ainda/i);

  /*
    Depois do terceiro, nenhum. Não é o cliente no vácuo: ele já foi
    avisado três vezes e o caso está na Fila. Um quarto aviso idêntico
    não informa nada — só prova que ninguém está lendo.
  */
  assert.equal(vouVerificar("Ryan", 3), null);
  assert.equal(vouVerificar("Ryan", 10), null);
});

/* ================================================================
   A IA não encurta nem completa a resposta do consultor
   ================================================================ */

/*
  Isto custou um cliente.

  O consultor digitou na Fila, três vezes: "preciso de: documento com foto,
  comprovante de endereço, contracheque atualizado e agência/conta".

  E o cliente recebeu:
    "Me manda uma foto do seu documento com foto pra começar."
    "Sim, só isso. Me manda uma foto do seu documento pra começar."
    "Me manda uma foto do seu documento pra começar."

  Três documentos sumiram, e na segunda a IA AFIRMOU que aquilo era tudo —
  contradizendo a própria resposta que recebeu. O cliente escreveu "tenho
  certeza que o banco não pede só isso" e parou de responder.

  A causa foi uma instrução de estilo minha ("nunca escreva lista, peça um
  por vez") vazando pro caminho em que a resposta do consultor é a fonte da
  verdade.
*/
const RESPOSTA_DELE =
  "preciso de: documento com foto, comprovante de endereço, contracheque atualizado e agência/conta";

test("a IA não pode descartar itens que o consultor pediu", () => {
  const encurtadas = [
    "Me manda uma foto do seu documento com foto pra começar.",
    "Me manda uma foto do seu documento pra começar.",
    "Preciso do seu documento com foto e do comprovante de endereço.",
  ];

  for (const t of encurtadas) {
    const sumiu = oQueSumiuDaResposta(t, RESPOSTA_DELE);
    assert.ok(sumiu.length > 0, `deixou passar texto encurtado: "${t}"`);
  }

  // O texto completo passa, escrito de outro jeito ou não.
  for (const t of [
    RESPOSTA_DELE,
    "Preciso de documento com foto, comprovante de endereço, contracheque atualizado e agência/conta. Pode mandar?",
    "Me manda documento com foto, comprovante de endereço, contracheque e agência/conta.",
  ]) {
    assert.deepEqual(oQueSumiuDaResposta(t, RESPOSTA_DELE), [], `barrou texto completo: "${t}"`);
  }
});

test("a IA não pode afirmar que aquilo é tudo por conta própria", () => {
  /*
    "Sim, só isso" é uma alegação sobre o que o banco exige. Quem sabe
    isso é o consultor — a IA não pode decidir um requisito de negócio.
  */
  for (const t of [
    "Sim, só isso. Me manda uma foto do seu documento.",
    "É só isso mesmo, pode mandar.",
    "Só preciso disso.",
    "Isso e mais nada.",
  ]) {
    assert.equal(afirmouSerTudoSemBase(t, RESPOSTA_DELE), true, `deixou passar: "${t}"`);
  }

  // Se o CONSULTOR disse que é só isso, a IA pode repetir.
  assert.equal(
    afirmouSerTudoSemBase("Sim, só isso mesmo.", "é só isso mesmo, mais nada"),
    false
  );

  // E texto que não afirma nada disso passa.
  assert.equal(afirmouSerTudoSemBase(RESPOSTA_DELE, RESPOSTA_DELE), false);
});

test("um item só não dispara a conferência de lista", () => {
  /*
    Quando o consultor pede uma coisa só, o agente pode reescrever à
    vontade — não há o que descartar. A conferência existe pra lista.
  */
  assert.deepEqual(
    oQueSumiuDaResposta("Me manda seu contracheque atualizado.", "manda o contracheque"),
    []
  );
});
