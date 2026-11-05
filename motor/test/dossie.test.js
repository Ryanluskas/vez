import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarCodigoOperacao, validarCodigoOperacao } from "../src/dossie/identificador.js";
import { classificarDocumento, validarChecklistCompleto, CATEGORIAS_DOCUMENTO } from "../src/dossie/classificador.js";
import { extrairContratos, consolidarContratos } from "../src/dossie/contratos.js";
import { extrairCpf, formatarCpf, extrairRg, extrairDadosDossie } from "../src/dossie/extracao.js";
import { conferirDocumentos, STATUS_CONFERENCIA } from "../src/dossie/conferencia.js";
import { montarTextoCorrentistaSantander } from "../src/dossie/montador_texto.js";
import { gerarHashAprovacao, validarIntegridadeAprovacao, autorizarEnvioAoGrupo } from "../src/dossie/aprovacao.js";
import { encaminharDossieAoGrupo } from "../src/dossie/encaminhador.js";

test("identificador gera código no padrão VEZ-2026-XXXXXX e valida formato", () => {
  const cod1 = gerarCodigoOperacao({ ano: 2026, sequencial: 154 });
  assert.equal(cod1, "VEZ-2026-000154");
  assert.equal(validarCodigoOperacao(cod1), true);

  const codAuto = gerarCodigoOperacao({ ano: 2026 });
  assert.match(codAuto, /^VEZ-2026-\d{6}$/);
  assert.equal(validarCodigoOperacao(codAuto), true);
  assert.equal(validarCodigoOperacao("INVALIDO-123"), false);
});

test("classificador categoriza documentos nas 5 categorias obrigatórias", () => {
  // 1. Documento com Foto (RG / CNH)
  const dFoto = classificarDocumento({ texto: "REPUBLICA FEDERATIVA DO BRASIL REGISTRO GERAL CARTEIRA DE IDENTIDADE SSP/SP" });
  assert.equal(dFoto.tipo, CATEGORIAS_DOCUMENTO.DOCUMENTO_FOTO);

  // 2. Extrato de Margem / HISCON
  const dMargem = classificarDocumento({ texto: "MINISTERIO DA PREVIDENCIA SOCIAL EXTRATO DE CONSIGNACOES MARGEM CONSIGNÁVEL LIVRE" });
  assert.equal(dMargem.tipo, CATEGORIAS_DOCUMENTO.EXTRATO_MARGEM);

  // 3. Contracheque
  const dHolerite = classificarDocumento({ texto: "DEMONSTRATIVO DE PAGAMENTO HOLERITE SALARIO BASE TOTAL DESCONTOS LIQUIDO A RECEBER" });
  assert.equal(dHolerite.tipo, CATEGORIAS_DOCUMENTO.CONTRACHEQUE);

  // 4. Comprovante de Endereço
  const dEndereco = classificarDocumento({ texto: "ENEL DISTRIBUICAO CONTA DE ENERGIA ELETRICA CEP 01310-100" });
  assert.equal(dEndereco.tipo, CATEGORIAS_DOCUMENTO.COMPROVANTE_ENDERECO);

  // 5. Contratos
  const dContrato = classificarDocumento({ texto: "BANCO SANTANDER CEDULA DE CREDITO BANCARIO CCB DETALHAMENTO DE PARCELAS SALDO DEVEDOR" });
  assert.equal(dContrato.tipo, CATEGORIAS_DOCUMENTO.CONTRATOS);

  // Checklist
  const cIncompleto = validarChecklistCompleto({ contratos: true, documento_foto: true });
  assert.equal(cIncompleto.completo, false);
  assert.equal(cIncompleto.totalRecebidos, 2);

  const cCompleto = validarChecklistCompleto({
    contratos: true,
    extrato_margem: true,
    contracheque: true,
    comprovante_endereco: true,
    documento_foto: true,
  });
  assert.equal(cCompleto.completo, true);
  assert.equal(cCompleto.pendentes.length, 0);
});

test("contratos extrai e consolida parcelas e saldos de múltiplos contratos", () => {
  const textoOCR = `
    Contrato: 600123456
    Parcela: R$ 850,00
    Taxa: 2,15% a.m.
    12 de 120 pagas

    Contrato: 600789012
    Parcela: R$ 420,50
    Taxa: 2,05% a.m.
    24 de 120 pagas
  `;

  const lista = extrairContratos(textoOCR);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].numero, "600123456");
  assert.equal(lista[0].parcela, 850);
  assert.equal(lista[1].numero, "600789012");
  assert.equal(lista[1].parcela, 420.5);

  const consolidado = consolidarContratos(lista);
  assert.equal(consolidado.totalContratos, 2);
  assert.equal(consolidado.somaParcelas, 1270.5);
  assert.equal(consolidado.somaParcelasFormatada, "R$ 1.270,50");
});

test("extracao e conferencia cruzada validam consistência entre documentos", () => {
  const dados = extrairDadosDossie({
    documentos: [
      { tipo: "documento_foto", texto: "NOME: MARIA SILVA CPF: 123.456.789-00 RG: 1234567 SSP/SP" },
      { tipo: "comprovante_endereco", texto: "RUA DAS FLORES 100 CEP 01310-100" },
      { tipo: "extrato_margem", texto: "BANCO SANTANDER AG: 1234 CC: 56789-0" },
    ],
  });

  assert.equal(dados.cpf, "123.456.789-00");
  assert.equal(dados.rg, "1234567");
  assert.equal(dados.endereco.cep, "01310-100");
  assert.equal(dados.bancario.agencia, "1234");

  const conf = conferirDocumentos({
    documentos: [
      { dados: { cpf: "12345678900" } },
      { dados: { cpf: "12345678900" } },
    ],
    dadosExtraidos: dados,
  });

  assert.equal(conf.itens.cpf.status, STATUS_CONFERENCIA.CONFIRMADO);
  assert.equal(conf.aprovadoAutomatico, true);
});

test("montarTextoCorrentistaSantander aplica divisão determinística da Capital Cred", () => {
  // Redução abaixo de R$ 8.000: 62% cliente / 38% empresa
  const texto1 = montarTextoCorrentistaSantander({
    codigoOperacao: "VEZ-2026-000154",
    dados: {
      nome: "SEBASTIÃO DIAS",
      cpf: "111.222.333-44",
      rg: "9876543",
      bancario: { agencia: "0333", conta: "12345-6" },
      endereco: { cep: "74000-000" },
    },
    valorReducao: 6000,
    parcelaAtual: 850,
  });

  assert.ok(texto1.includes("VEZ-2026-000154"));
  assert.ok(texto1.includes("SEBASTIÃO DIAS"));
  assert.ok(texto1.includes("R$ 3.720,00 (62%)"));
  assert.ok(texto1.includes("R$ 2.280,00 (38%)"));
  assert.ok(texto1.includes("1,40% a.m."));
  assert.ok(texto1.includes("120 meses"));

  // Redução a partir de R$ 8.000: 50% cliente / 50% empresa
  const texto2 = montarTextoCorrentistaSantander({
    codigoOperacao: "VEZ-2026-000155",
    dados: { nome: "LÚCIA MARTINS" },
    valorReducao: 10000,
  });
  assert.ok(texto2.includes("R$ 5.000,00 (50%)"));
});

test("aprovação estrita bloqueia envio ao grupo sem autorização humana expressa", async () => {
  const opNaoAprovada = {
    status: "em_coleta",
    codigo_operacao: "VEZ-2026-000001",
    texto_pagamento: "Texto qualquer",
  };

  const checagem = autorizarEnvioAoGrupo({ operacao: opNaoAprovada });
  assert.equal(checagem.autorizado, false);

  await assert.rejects(
    () => encaminharDossieAoGrupo({ operacao: opNaoAprovada, grupoDestinoJid: "12345@g.us" }),
    /Envio não autorizado/
  );

  // Operação aprovada com hash válido
  process.env.DOSSIE_HMAC_SECRET = "chave_exclusiva_de_teste_automatizado_hmac_sha256_segura_2026";
  const idOp = "dossie-uuid-123";
  const codOp = "VEZ-2026-000002";
  const txt = "Texto padronizado correntista Santander com mais de cinquenta caracteres para validação completa.";
  const userId = "user-123";
  const ts = new Date().toISOString();
  const hash = gerarHashAprovacao({ idOperacao: idOp, codigoOperacao: codOp, idOrganizacao: userId, textoPagamento: txt, userId, timestamp: ts });

  assert.equal(
    validarIntegridadeAprovacao({
      idOperacao: idOp,
      codigoOperacao: codOp,
      idOrganizacao: userId,
      textoPagamento: txt,
      userId,
      timestamp: ts,
      hashEsperado: hash,
    }),
    true
  );

  const opAprovada = {
    id: idOp,
    codigo_operacao: codOp,
    user_id: userId,
    status: "aprovado",
    aprovado_por: userId,
    aprovado_em: ts,
    hash_aprovacao: hash,
    texto_pagamento: txt,
  };

  const checagemAprovada = autorizarEnvioAoGrupo({ operacao: opAprovada, userId });
  assert.equal(checagemAprovada.autorizado, true);

  // Teste de adulteração pós-aprovação (anti-tampering)
  const opAdulterada = {
    ...opAprovada,
    texto_pagamento: txt + " [VALOR ALTERADO INDEVIDAMENTE]",
  };
  const checagemAdulterada = autorizarEnvioAoGrupo({ operacao: opAdulterada, userId });
  assert.equal(checagemAdulterada.autorizado, false);
  assert.match(checagemAdulterada.motivo, /adulterados/i);

  // Teste de encaminhamento seguro
  const disparos = [];
  const mockEvolution = {
    async enviarTexto({ para, texto }) {
      disparos.push({ para, texto });
    },
    async enviarMedia() {},
  };

  const resultado = await encaminharDossieAoGrupo({
    operacao: opAprovada,
    userId,
    grupoDestinoJid: "1203630456789@g.us",
    clienteTelefone: "5562999998888",
    instanciaEvolution: "instancia_teste",
    clienteEvolution: mockEvolution,
  });

  assert.equal(resultado.ok, true);
  assert.equal(disparos.length, 2); // 1 pro grupo, 1 pro cliente
  assert.equal(disparos[0].para, "1203630456789@g.us");
  assert.ok(disparos[1].texto.includes("já foram encaminhados para processamento"));
});
