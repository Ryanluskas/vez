import test from "node:test";
import assert from "node:assert/strict";
import { decidir, ACOES } from "../src/agente/decidir.js";
import { montarPedido, PARA_FECHAR } from "../src/requisitos.js";
import { identificarObjecao, TIPOS_OBJECAO } from "../src/comercial/objecoes.js";
import { respostaObjecao, ehAvisoDeQueVaiVerificar } from "../src/respostas.js";
import { calcularReducaoCapitalCred } from "../src/comercial/calculadora.js";
import { classificarTemperaturaLead } from "../src/comercial/qualificador.js";

test("Caso Real Ryan: Cliente pede simulação -> Objeções e Documentos 5 itens", async (t) => {
  await t.test("1. Detecção de acordo de fechamento em 'Certo, vamos fazer então, como funciona?'", () => {
    const texto = "Certo, vamos fazer então, como funciona?";
    const objecao = identificarObjecao(texto);
    assert.ok(objecao, "Deve identificar intenção de fechamento/acordo");
    assert.equal(objecao.tipo, TIPOS_OBJECAO.ACORDO_FECHAMENTO);
  });

  await t.test("2. Fechamento DEVE exigir os 5 documentos oficiais completos (não apenas RG)", () => {
    const memoria = { nome: "Ryan Lukas" };
    const decisao = decidir({
      conversa: { etapa: "qualificado", soVoce: false, temPendenciaAberta: false },
      memoria,
      objecao: { tipo: TIPOS_OBJECAO.ACORDO_FECHAMENTO },
      ultimasMensagens: [],
    });

    assert.equal(decisao.acao, ACOES.PERGUNTAR_CLIENTE);
    assert.ok(decisao.pedido?.texto, "Deve conter texto de pedido");
    
    // Verifica presença dos 5 documentos obrigatórios no texto gerado
    const texto = decisao.pedido.texto;
    assert.match(texto, /documento\s+(?:oficial\s+)?com\s+foto/i, "Deve pedir documento com foto");
    assert.match(texto, /comprovante\s+de\s+endere[cç]o/i, "Deve pedir comprovante de endereço");
    assert.match(texto, /contracheque/i, "Deve pedir contracheque atualizado");
    assert.match(texto, /extrato\s+de\s+margem/i, "Deve pedir extrato de margem");
    assert.match(texto, /contrato.*santander/i, "Deve pedir contrato(s) do Santander");
    assert.match(texto, /alternativa|prefere\s+me\s+mandar/i, "Deve encerrar com alternativa ilusória");

    // Verifica que as chaves de fechamento contêm os 5 requisitos
    assert.deepEqual(decisao.pedido.chaves, PARA_FECHAR);
  });

  await t.test("3. Cliente pergunta 'Só isso mesmo?' -> Bot confirma com segurança e objetividade", () => {
    const texto = "Só isso mesmo?";
    const objecao = identificarObjecao(texto);
    assert.ok(objecao, "Deve identificar confirmação de documentos");
    assert.equal(objecao.tipo, TIPOS_OBJECAO.CONFIRMACAO_DOCUMENTOS);

    const resposta = respostaObjecao(objecao.tipo, "Ryan");
    assert.match(resposta, /isso\s+mesmo/i);
    assert.match(resposta, /5\s+documentos/i);
    assert.match(resposta, /santander/i);
  });

  await t.test("4. Calculadora CapitalCred: Total R$ 7.600 -> cliente recebe proposta líquida", () => {
    const calculo = calcularReducaoCapitalCred("7600");
    assert.ok(calculo.valido);
    assert.equal(calculo.valorTotal, 7600);
    assert.ok(calculo.cliente > 0);
    assert.ok(calculo.empresa > 0);
    assert.ok(calculo.clienteFormatado.includes("4.") || calculo.clienteFormatado.includes("5."));
  });

  await t.test("5. Evitar duplo aviso de espera: ehAvisoDeQueVaiVerificar reconhece simulação em andamento", () => {
    const aviso1 = "Vou fazer uma simulação aqui no sistema para você, Ryan, para ver quanto libera certinho e já te passo as condições, tá bom?";
    assert.equal(ehAvisoDeQueVaiVerificar(aviso1), true, "Deve reconhecer aviso de simulação para não duplicar");

    const aviso2 = "Ryan, vou confirmar isso certinho e já te retorno.";
    assert.equal(ehAvisoDeQueVaiVerificar(aviso2), true);
  });

  await t.test("6. Prevenção de perda indevida: conversa com bot pausado não vai para 'perdido' sem opt-out", () => {
    const conversa = { atender: false, etapa: "qualificado", opt_out: false };
    const lead = classificarTemperaturaLead({
      conversa,
      memoria: { convenio: "INSS", banco: "Santander" },
      ultimaMensagem: "Queria ver a possibilidade de liberação que tenho",
    });
    // A etapa permanece preservada a menos que haja opt-out explícito
    assert.equal(conversa.opt_out, false);
    assert.equal(conversa.etapa, "qualificado");
  });
});
