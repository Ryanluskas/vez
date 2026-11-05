import { test } from "node:test";
import assert from "node:assert/strict";
import {
  identificarObjecao,
  identificarAcordoFechamento,
  TIPOS_OBJECAO,
} from "../src/comercial/objecoes.js";
import {
  diagnosticarNecessidade,
  proximaPerguntaSpin,
  OBJETIVOS_CLIENTE,
} from "../src/comercial/spin.js";
import { classificarTemperaturaLead } from "../src/comercial/qualificador.js";
import { obterManualCapitalCred, DADOS_CAPITALCRED, DIRETRIZES_DE_PERSUASAO } from "../src/comercial/playbook.js";
import { decidir, ACOES } from "../src/agente/decidir.js";

test("identificarObjecao detecta as principais objeções de crédito consignado", () => {
  const o1 = identificarObjecao("Isso é golpe? Como posso confiar em vocês?");
  assert.ok(o1);
  assert.equal(o1.tipo, TIPOS_OBJECAO.GOLPE_SEGURANCA);

  const o2 = identificarObjecao("Não vou mandar foto do meu documento.");
  assert.ok(o2);
  assert.equal(o2.tipo, TIPOS_OBJECAO.NAO_ENVIA_DOCUMENTOS);

  const o3 = identificarObjecao("Vou dar uma pensada e qualquer coisa te chamo");
  assert.ok(o3);
  assert.equal(o3.tipo, TIPOS_OBJECAO.VOU_PENSAR);

  const o4 = identificarObjecao("Já tenho um consultor que cuida dos meus contratos");
  assert.ok(o4);
  assert.equal(o4.tipo, TIPOS_OBJECAO.JA_TEM_CONSULTOR);

  const o5 = identificarObjecao("Não tenho interesse no momento, obrigado");
  assert.ok(o5);
  assert.equal(o5.tipo, TIPOS_OBJECAO.NAO_TEM_INTERESSE);

  const oOptOut = identificarObjecao("Não tenho interesse, favor tirar meu número");
  assert.ok(oOptOut);
  assert.equal(oOptOut.tipo, TIPOS_OBJECAO.OPT_OUT_EXPLICITO);

  const o6 = identificarObjecao("Vou conversar com minha esposa antes de fechar");
  assert.ok(o6);
  assert.equal(o6.tipo, TIPOS_OBJECAO.CONVERSAR_FAMILIA);

  const o7 = identificarObjecao("Não entendi como funciona essa portabilidade");
  assert.ok(o7);
  assert.equal(o7.tipo, TIPOS_OBJECAO.NAO_ENTENDEU);

  assert.equal(identificarObjecao("Olá bom dia"), null);
  assert.equal(identificarObjecao(""), null);
});

test("diagnosticarNecessidade mapeia objetivo do cliente via SPIN", () => {
  const n1 = diagnosticarNecessidade("Minha parcela tá muito pesada, queria diminuir a parcela do mês");
  assert.ok(n1);
  assert.equal(n1.objetivo, OBJETIVOS_CLIENTE.REDUZIR_PARCELA);

  const n2 = diagnosticarNecessidade("Preciso de um dinheiro na conta pra uma urgência");
  assert.ok(n2);
  assert.equal(n2.objetivo, OBJETIVOS_CLIENTE.TROCO);

  const n3 = diagnosticarNecessidade("Quero quitar o cartão de crédito que tá com juros altos");
  assert.ok(n3);
  assert.equal(n3.objetivo, OBJETIVOS_CLIENTE.QUITAR_DIVIDA);

  assert.equal(diagnosticarNecessidade("tudo bem"), null);
});

test("proximaPerguntaSpin identifica qual dado situacional ou de necessidade perguntar", () => {
  // Sem convênio: primeira pergunta
  const p1 = proximaPerguntaSpin({ memoria: {} });
  assert.equal(p1.campoFaltante, "convenio");
  assert.ok(p1.pergunta.includes("aposentado do INSS"));

  // Com convênio, sem banco: segunda pergunta
  const p2 = proximaPerguntaSpin({ memoria: { convenio: "inss" } });
  assert.equal(p2.campoFaltante, "banco");
  assert.ok(p2.pergunta.includes("banco"));

  // Com convênio e banco, sem objetivo: terceira pergunta
  const p3 = proximaPerguntaSpin({ memoria: { convenio: "inss", banco: "bradesco" } });
  assert.equal(p3.campoFaltante, "objetivo");
  assert.ok(p3.pergunta.includes("liberar um valor"));

  // Com tudo coletado: nada pendente no SPIN
  const p4 = proximaPerguntaSpin({
    memoria: { convenio: "inss", banco: "bradesco", objetivo: "troco" },
  });
  assert.equal(p4, null);
});

test("classificarTemperaturaLead avalia a qualificação do lead", () => {
  // Lead desqualificado
  const l1 = classificarTemperaturaLead({
    conversa: { atender: false },
    memoria: {},
  });
  assert.equal(l1.qualificacao, "desqualificada");

  // Lead quente com documentação
  const l2 = classificarTemperaturaLead({
    conversa: { etapa: "documentos_recebidos" },
    memoria: { convenio: "inss", banco: "santander" },
  });
  assert.equal(l2.qualificacao, "quente");

  // Lead morno em conversa
  const l3 = classificarTemperaturaLead({
    conversa: { etapa: "conversando" },
    memoria: { convenio: "inss" },
  });
  assert.equal(l3.qualificacao, "morna");

  // Lead frio no início
  const l4 = classificarTemperaturaLead({
    conversa: { etapa: "novo" },
    memoria: {},
  });
  assert.equal(l4.qualificacao, "fria");
});

test("obterManualCapitalCred inclui dados oficiais e regras éticas", () => {
  const manual = obterManualCapitalCred();
  assert.ok(manual.includes(DADOS_CAPITALCRED.cnpj));
  assert.ok(manual.includes("CapitalCred"));
  assert.ok(manual.includes("biometria facial"));
  assert.ok(manual.includes("Nunca cobramos valores antecipados"));
});

test("3 Testes de Estresse de Persuasão: Prazo, Escudo e Fechamento", () => {
  // Teste 1: Teste do Prazo ("Não quero voltar para 120 meses")
  const objPrazo = identificarObjecao("Não quero voltar para 120 meses");
  assert.ok(objPrazo);
  assert.equal(objPrazo.tipo, TIPOS_OBJECAO.RECUSA_OFERTA);
  assert.ok(objPrazo.diretriz.includes("consultor verifique outra configuração"));
  const decPrazo = decidir({ conversa: {}, objecao: objPrazo });
  assert.equal(decPrazo.acao, ACOES.RESPONDER);
  assert.equal(decPrazo.categoria, "objecao");

  // Teste 2: Teste do Escudo ("Vou pensar")
  const objEscudo = identificarObjecao("Vou pensar");
  assert.ok(objEscudo);
  assert.equal(objEscudo.tipo, TIPOS_OBJECAO.VOU_PENSAR);
  assert.ok(objEscudo.diretriz.includes("Respeite o tempo de reflexão"));
  const decEscudo = decidir({ conversa: {}, objecao: objEscudo });
  assert.equal(decEscudo.acao, ACOES.RESPONDER);
  assert.equal(decEscudo.categoria, "objecao");

  // Teste 3: Teste do Fechamento ("Pode fazer" / "Fechado") -> 1 requisito por vez, sem escolha forçada
  const objFechamento = identificarObjecao("Pode fazer, fechado!");
  assert.ok(objFechamento);
  assert.equal(objFechamento.tipo, TIPOS_OBJECAO.ACORDO_FECHAMENTO);
  assert.ok(objFechamento.diretriz.includes("próximo documento pendente"));
  const decFechamento = decidir({ conversa: {}, objecao: objFechamento });
  assert.equal(decFechamento.acao, ACOES.PERGUNTAR_CLIENTE);
  assert.equal(decFechamento.pedido.chaves.length, 1, "Deve pedir 1 item por vez");
  assert.equal(/agora ou prefere/i.test(decFechamento.pedido.texto), false, "Não deve usar escolha forçada");

  // Validação das Diretrizes no Manual
  const manual = obterManualCapitalCred();
  assert.ok(manual.includes("DIRETRIZES DE ATENDIMENTO CONSULTIVO E TRANSPARÊNCIA"));
  assert.ok(manual.includes("Escuta Ativa"));
  assert.ok(manual.includes("Respeito à Recusa"));
  assert.ok(manual.includes("Transparência de Segurança"));
  assert.ok(manual.includes("Condução Natural de Documentos"));
});

test("Simulador CapitalCred: cálculo determinístico 62/38 (< R$ 8.000) e 50/50 (>= R$ 8.000)", async () => {
  const { calcularReducaoCapitalCred, comoDinheiro, comoNumero } = await import("../src/comercial/calculadora.js");

  // Caso abaixo de 8000: 62% cliente / 38% empresa
  const c1 = calcularReducaoCapitalCred(7600);
  assert.equal(c1.valido, true);
  assert.equal(c1.valorTotal, 7600);
  assert.equal(c1.cliente, 4712);
  assert.equal(c1.empresa, 2888);
  assert.equal(c1.percentualCliente, 62);
  assert.equal(c1.percentualEmpresa, 38);
  assert.equal(c1.clienteFormatado, "R$ 4.712,00");
  assert.equal(c1.empresaFormatado, "R$ 2.888,00");

  // Caso a partir de 8000: 50% cliente / 50% empresa
  const c2 = calcularReducaoCapitalCred(10000);
  assert.equal(c2.valido, true);
  assert.equal(c2.valorTotal, 10000);
  assert.equal(c2.cliente, 5000);
  assert.equal(c2.empresa, 5000);
  assert.equal(c2.percentualCliente, 50);
  assert.equal(c2.percentualEmpresa, 50);

  // --- TESTES DE FRONTEIRA E CASOS EXTREMOS ---
  // 1. Imediatamente antes do corte: R$ 7.999,99 (62/38)
  const f1 = calcularReducaoCapitalCred(7999.99);
  assert.equal(f1.valido, true);
  assert.equal(f1.percentualCliente, 62);
  assert.equal(f1.percentualEmpresa, 38);
  assert.equal(f1.cliente, 4959.99);
  assert.equal(f1.empresa, 3040.00);
  assert.equal(f1.cliente + f1.empresa, 7999.99);

  // 2. No ponto de corte exato: R$ 8.000,00 (50/50)
  const f2 = calcularReducaoCapitalCred(8000.00);
  assert.equal(f2.valido, true);
  assert.equal(f2.percentualCliente, 50);
  assert.equal(f2.percentualEmpresa, 50);
  assert.equal(f2.cliente, 4000.00);
  assert.equal(f2.empresa, 4000.00);
  assert.equal(f2.cliente + f2.empresa, 8000.00);

  // 3. Imediatamente após o corte: R$ 8.000,01 (50/50)
  const f3 = calcularReducaoCapitalCred(8000.01);
  assert.equal(f3.valido, true);
  assert.equal(f3.percentualCliente, 50);
  assert.equal(f3.percentualEmpresa, 50);
  assert.equal(f3.cliente, 4000.01);
  assert.equal(f3.empresa, 4000.00);
  assert.equal(f3.cliente + f3.empresa, 8000.01);

  // 4. Zero: deve ser rejeitado (valido: false)
  const fZero = calcularReducaoCapitalCred(0);
  assert.equal(fZero.valido, false);
  assert.equal(fZero.valorTotal, 0);
  assert.equal(fZero.cliente, 0);

  // 5. Negativo: deve ser rejeitado (valido: false)
  const fNeg = calcularReducaoCapitalCred(-150);
  assert.equal(fNeg.valido, false);
  assert.equal(fNeg.valorTotal, 0);

  // 6. Inválidos / nulos / NaN
  assert.equal(calcularReducaoCapitalCred(null).valido, false);
  assert.equal(calcularReducaoCapitalCred(undefined).valido, false);
  assert.equal(calcularReducaoCapitalCred("invalido").valido, false);
  assert.equal(calcularReducaoCapitalCred(NaN).valido, false);

  // 7. Formatação segura contra undefined/null/NaN
  assert.equal(comoDinheiro(undefined), null);
  assert.equal(comoDinheiro(null), null);
  assert.equal(comoDinheiro(NaN), null);
  assert.equal(comoDinheiro(Infinity), null);
  assert.equal(comoDinheiro("string"), null);
  assert.equal(comoDinheiro(7600), "R$ 7.600,00");

  // 8. Parsing de strings brasileiras
  assert.equal(comoNumero("R$ 8.500,50"), 8500.5);
  assert.equal(comoNumero("7.600"), 7600);
  assert.equal(comoNumero("7600,00"), 7600);
});
