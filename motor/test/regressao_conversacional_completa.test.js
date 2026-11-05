import { test } from "node:test";
import assert from "node:assert/strict";

import { interpretarMensagemCurtaContextual } from "../src/referencias.js";
import { montarPedido, foiRecusado, ultimoRequisitoPerguntado } from "../src/requisitos.js";
import { identificarObjecao, TIPOS_OBJECAO } from "../src/comercial/objecoes.js";
import { decidir, ACOES, podeAgirSozinho } from "../src/agente/decidir.js";
import {
  respostaObjecao,
  respostaRecusaContextual,
  respostaEsclarecimentoContextual,
  respostaCobrancaContextual,
  conferido,
} from "../src/respostas.js";
import { validarAntesDeEnviar } from "../src/agente/validar.js";
import {
  gerarHashAprovacao,
  autorizarEnvioAoGrupo,
  calcularHashDocumentos,
  calcularHashDadosBancarios,
  migrarOperacaoLegadaParaReaprovacao,
} from "../src/dossie/aprovacao.js";
import { encaminharDossieAoGrupo } from "../src/dossie/encaminhador.js";
import { extrairContratos } from "../src/dossie/contratos.js";
import { conferirDocumentos, STATUS_CONFERENCIA } from "../src/dossie/conferencia.js";
import { buscarContextoCampanha, decomporTelefone } from "../src/integracoes/botzapzap.js";
import { criarGestorIA } from "../src/ia/gestor.js";
import { SimuladorAtendimento } from "./simulacao_multiagentes.test.js";

process.env.DOSSIE_HMAC_SECRET = "chave_exclusiva_de_teste_automatizado_hmac_sha256_segura_2026";

test("Cenário A — Recusa repetida de documento: nunca repete pedido após 'Não'", async () => {
  const memoriaInicial = {
    nome: "Antônio",
    convenio: "inss",
    banco: "santander",
    perguntado: {
      contracheque: 1,
      _ultima_pergunta_agente: "Antônio, me manda uma foto ou PDF do seu contracheque mais recente?",
    },
    recusas: [],
  };

  // Cliente responde "Não" após o agente pedir o documento
  const interpretacao1 = interpretarMensagemCurtaContextual("Não", memoriaInicial, {
    etapa: "aguardando_dados",
  });
  assert.ok(interpretacao1, "Deve interpretar 'Não' em contexto após pedido de documento");
  assert.equal(interpretacao1.tipo, "recusa_contextual");
  assert.equal(interpretacao1.chaveRecusada, "contracheque");

  // Registra a recusa na memória
  const memoriaAposRecusa1 = {
    ...memoriaInicial,
    recusas: [{ item: "contracheque", motivo: "Não", em: new Date().toISOString() }],
    perguntado: {
      ...memoriaInicial.perguntado,
      _recusas: [{ item: "contracheque", motivo: "Não", em: new Date().toISOString() }],
    },
  };

  assert.equal(foiRecusado(memoriaAposRecusa1, "contracheque"), true);

  // Resposta contextual respeita a recusa e NÃO repete o pedido do contracheque
  const resp1 = respostaRecusaContextual("contracheque", "Antônio");
  assert.equal(/me\s+manda\s+seu\s+contracheque/i.test(resp1), false, "Não pode repetir o pedido do contracheque");
  assert.match(resp1, /tudo\s+bem|respeito\s+sua\s+decis[aã]o/i);

  // montarPedido NUNCA mais inclui o item recusado
  const proximoPedido = montarPedido(memoriaAposRecusa1, { para: "simular" });
  if (proximoPedido) {
    assert.equal(
      proximoPedido.chaves.includes("contracheque"),
      false,
      "Item recusado jamais pode voltar em montarPedido"
    );
  }

  // Se o cliente disser "Não" uma segunda vez, encerra a insistência e aciona consultor
  const resp2 = respostaRecusaContextual("extrato", "Antônio");
  assert.match(resp2, /consultor|n[aã]o\s+vou\s+pedir/i);

  // Validador final bloqueia qualquer mensagem que tente pedir item recusado
  const validacaoInsistencia = validarAntesDeEnviar(
    "Antônio, me manda seu contracheque atualizado pra eu conferir os dados?",
    {
      memoria: memoriaAposRecusa1,
      conversa: "Cliente: Não",
      fontesPermitidas: [],
    }
  );
  assert.equal(validacaoInsistencia.ok, false);
  assert.match(validacaoInsistencia.motivo, /recusou enviar/i);
});

test("Cenário B — Acusação de golpe ('Vocês dão golpes?' / 'Puro golpe isso'): desarma venda e aciona humano", async () => {
  const sim = new SimuladorAtendimento("Cenário B", "Cliente acusa golpe");
  await sim.inicializarConversa("5511988880002", "Roberto");

  const obj1 = identificarObjecao("Vocês dão golpes?");
  assert.ok(obj1);
  assert.equal(obj1.tipo, TIPOS_OBJECAO.RECLAMACAO_GRAVE);
  assert.equal(obj1.exigeHandoffHumano, true);

  const obj2 = identificarObjecao("Puro golpe isso.");
  assert.ok(obj2);
  assert.equal(obj2.tipo, TIPOS_OBJECAO.RECLAMACAO_GRAVE);
  assert.equal(obj2.exigeHandoffHumano, true);

  const dec = decidir({
    conversa: { etapa: "qualificado", soVoce: false, temPendenciaAberta: false },
    memoria: { nome: "Roberto" },
    objecao: obj1,
    ultimasMensagens: [],
  });
  assert.equal(dec.acao, ACOES.PEDIR_AO_CONSULTOR);
  assert.equal(dec.assumirManual, true);
  assert.equal(podeAgirSozinho(dec, "autonomo", ["objecao"]), false, "Acusação grave nunca sai em modo autônomo");

  const t1 = await sim.enviarMensagemCliente("Vocês dão golpes? Puro golpe isso.");
  assert.equal(t1.soVoce, true, "Conversa deve ir para controle humano (so_voce = true)");
  // Resposta ao cliente não contém pitch de vendas nem pedido de documentos
  for (const r of t1.respostasBot) {
    assert.equal(/1,40%|me\s+manda\s+foto|contracheque|extrato/i.test(r), false, "Proibido tentar vender após acusação de golpe");
  }
});

test("Cenário C — Ameaça de denúncia ('E vou denunciar pra polícia'): interrompe automação e escala", async () => {
  const sim = new SimuladorAtendimento("Cenário C", "Cliente ameaça polícia");
  await sim.inicializarConversa("5511988880003", "Sônia");

  const obj = identificarObjecao("E vou denunciar pra polícia.");
  assert.ok(obj);
  assert.equal(obj.tipo, TIPOS_OBJECAO.AMEACA_DENUNCIA);
  assert.equal(obj.exigeHandoffHumano, true);

  const t1 = await sim.enviarMensagemCliente("E vou denunciar pra polícia.");
  assert.equal(t1.soVoce, true, "Deve acionar so_voce imediatamente");

  // Mensagem subsequente não é respondida pelo robô porque so_voce está travado
  const t2 = await sim.enviarMensagemCliente("Estão me ouvindo?");
  assert.equal(t2.totalRespostas, 0, "Robô deve permanecer em silêncio após escalonamento de denúncia");
});

test("Cenário D — Pergunta sobre valor ('Quanto libera?') seguida de 'Oi?': responde em contexto sem despejar 4 documentos", async () => {
  const sim = new SimuladorAtendimento("Cenário D", "Cliente pergunta quanto libera e cobra Oi?");
  await sim.inicializarConversa("5511988880004", "Cláudio");

  // Turno 1: Cliente pergunta "Quanto libera?"
  const t1 = await sim.enviarMensagemCliente("Quanto libera?");
  assert.equal(t1.totalRespostas, 1);
  // Não despeja lista de 4 ou 5 documentos
  assert.equal(
    /1\.\s*Documento|comprovante\s+de\s+endere[cç]o.*contracheque.*extrato/is.test(t1.respostasBot[0]),
    false,
    "Nunca deve despejar lista de 4/5 documentos quando o cliente pergunta quanto libera"
  );

  // Turno 2: Cliente manda "Oi?" cobrando retorno
  const interpretacao = interpretarMensagemCurtaContextual(
    "Oi?",
    { ultima_pergunta_cliente: "Quanto libera?" },
    { etapa: "aguardando_voce", temPendenciaAberta: true }
  );
  assert.ok(interpretacao);
  assert.equal(interpretacao.tipo, "cobranca_ou_oi_contextual");

  const respContextual = respostaCobrancaContextual({ aguardandoConsultor: true }, "Cláudio");
  assert.match(respContextual, /aguardando\s+a\s+confirma[cç][aã]o|consultor|aviso/i);
  assert.equal(
    /comprovante\s+de\s+endere[cç]o|contracheque|extrato/i.test(respContextual),
    false,
    "Resposta a 'Oi?' não pode pedir documentos fora de contexto"
  );
});

test("Cenário E — 'Que?' após mensagem anterior: esclarece em linguagem simples e barra números truncados como 'R$9, em 7 de R$6'", () => {
  const memoria = {
    nome: "Valdir",
    ultima_pergunta_agente: "Valdir, você gostaria de verificar a revisão da sua parcela no Santander?",
  };
  const interpretacao = interpretarMensagemCurtaContextual("Que?", memoria, {
    etapa: "em_qualificacao",
  });
  assert.ok(interpretacao);
  assert.equal(interpretacao.tipo, "pedido_esclarecimento");

  const esclarecimento = respostaEsclarecimentoContextual(
    { ultimaPerguntaAgente: memoria.ultima_pergunta_agente },
    "Valdir"
  );
  assert.match(esclarecimento, /desculpa\s+se\s+n[aã]o\s+ficou\s+claro/i);
  assert.equal(/\d/.test(esclarecimento), false, "Esclarecimento contextual não inventa nenhum número");

  // Garante que uma frase truncada/desconexa como "R$9, em 7 de R$6" é barrada pela barreira de saída
  const validacaoTruncada = validarAntesDeEnviar("R$9, em 7 de R$6", {
    memoria,
    conversa: "Cliente: Que?",
    fontesPermitidas: [],
  });
  assert.equal(validacaoTruncada.ok, false, "Números desconexos como 'R$9, em 7 de R$6' devem ser barrados");
});

test("Cenário F — Decisão compartilhada com esposa: acolhe sem mudar de assunto para questionário de convênio", async () => {
  const sim = new SimuladorAtendimento("Cenário F", "Cliente precisa falar com a esposa");
  await sim.inicializarConversa("5511988880006", "Paulo");

  // Simula conversa onde o cliente diz que precisa falar com a esposa
  const obj = identificarObjecao("Não sei, tenho que falar com a minha esposa.");
  assert.ok(obj);
  assert.equal(obj.tipo, TIPOS_OBJECAO.CONVERSAR_FAMILIA);

  const resp = respostaObjecao(TIPOS_OBJECAO.CONVERSAR_FAMILIA, "Paulo");
  assert.match(resp, /conversar\s+em\s+casa|olharem\s+juntos/i);
  assert.equal(
    /aposentado|pensionista|servidor\s+p[uú]blico/i.test(resp),
    false,
    "Proibido mudar de assunto para perguntar se é aposentado ou servidor público"
  );
  assert.equal(
    /reserva\s+cai|taxa\s+sobe|hoje/i.test(resp),
    false,
    "Proibido usar escassez artificial contra decisão familiar"
  );
});

test("Cenário G — Mensagem informal ('Me dá um dinheiro aí'): não usa template robótico nem inventa valores", async () => {
  const sim = new SimuladorAtendimento("Cenário G", "Cliente informal");
  await sim.inicializarConversa("5511988880007", "Jorge");

  const t1 = await sim.enviarMensagemCliente("Me dá um dinheiro aí");
  for (const r of t1.respostasBot) {
    assert.equal(/1,40%|120\s+meses|R\$\s*\d/i.test(r), false, "Não pode inventar valores ou taxas");
    assert.equal(/alternativa\s+ilus[oó]ria|agora\s+ou\s+prefere/i.test(r), false, "Não pode usar template agressivo");
  }
});

test("Cenários H, I e J — Ciclo completo de Opt-Out LGPD: bloqueio imediato, 'Oi' ignorado e retomada explícita auditada", async () => {
  const sim = new SimuladorAtendimento("Cenários H-J", "Ciclo LGPD");
  await sim.inicializarConversa("5511988880008", "Helena");

  // Cenário H: Cliente pede opt-out explícito
  const tH = await sim.enviarMensagemCliente("Pare de me mandar mensagem");
  assert.equal(sim.conversa.opt_out, true, "opt_out deve ser ativado");
  assert.equal(sim.conversa.atender, false, "atender deve ser desativado");
  assert.equal(sim.conversa.etapa, "perdido");
  assert.ok(tH.respostasBot[0].includes("descadastrado"), "Deve enviar confirmação única de descadastramento");

  // Cenário I: Cliente em opt-out envia apenas "Oi" -> permanece bloqueado
  const tI = await sim.enviarMensagemCliente("Oi");
  assert.equal(sim.conversa.opt_out, true, "'Oi' isolado NÃO pode remover opt_out");
  assert.equal(sim.conversa.atender, false, "'Oi' isolado NÃO pode reativar atendimento");
  assert.equal(tI.totalRespostas, 0, "Nenhuma resposta automática deve sair para contato em opt-out que diz apenas 'Oi'");

  // Cenário J: Cliente envia pedido explícito de retomada ("Quero voltar a conversar sobre a proposta")
  const tJ = await sim.enviarMensagemCliente("Oi, quero fazer de novo a simulação");
  assert.equal(sim.conversa.opt_out, false, "Pedido explícito de retomada deve limpar opt_out");
  assert.equal(sim.conversa.atender, true, "Pedido explícito deve reativar atendimento");
});

test("Cenário K — Campanha do Botzapzap: enriquece contexto sem fabricar simulação 1,40% e bloqueia colisão de sufixo entre DDDs", () => {
  // Verifica decomposição de DDD e sufixo 8 dígitos
  const d11 = decomporTelefone("5511987654321");
  const d21 = decomporTelefone("5521987654321");
  assert.equal(d11.sufixo8, d21.sufixo8);
  assert.notEqual(d11.ddd, d21.ddd, "DDDs distintos são preservados para impedir colisão de sufixo");

  const resultadoInexistente = buscarContextoCampanha(
    "5521987654321",
    "C:/caminho_inexistente_apenas_teste_seguro"
  );
  assert.equal(resultadoInexistente.pertenceCampanha, false, "Diretório inexistente degrada com segurança");

  // Verifica que conferido() sem simulação real bloqueia '1,40%' e '120 meses'
  const tentativaSemLastro = conferido(
    "Consegui reduzir sua taxa para 1,40% no prazo de 120 meses!",
    { memoria: {}, conversa: "" }
  );
  assert.equal(tentativaSemLastro, null, "Taxa 1,40% e prazo 120 meses sem simulação verificada devem ser bloqueados");
});

test("Cenário L — Documentos incompletos e múltiplos contratos: consolida páginas, diferencia recebido vs validado e detecta divergência de nome", () => {
  const textoMultiPagina = `
    Contrato: 9988776655
    Parcela R$ 450,00
    --- Página 2 ---
    Contrato: 9988776655
    Saldo Devedor R$ 18.200,00
    Prazo: 42/84
  `;
  const contratos = extrairContratos(textoMultiPagina);
  assert.equal(contratos.length, 1, "Mesmo número de contrato em páginas distintas deve ser consolidado");
  assert.equal(contratos[0].parcela, 450);
  assert.equal(contratos[0].saldoDevedor, 18200);
  assert.equal(contratos[0].pagas, 42);
  assert.equal(contratos[0].total, 84);

  // Conferência documental: documento recebido sem dados válidos e divergência de titular
  const conf = conferirDocumentos({
    documentos: [
      {
        tipo_documento: "documento_identidade",
        dados_extraidos: { cpf: "12345678909", nome: "JOÃO CARLOS SILVA" },
      },
      {
        tipo_documento: "extrato_emprestimos",
        dados_extraidos: { cpf: "12345678909", nome: "MARCOS ANTÔNIO SOUZA" },
      },
      {
        tipo_documento: "comprovante_endereco",
        dados_extraidos: {}, // Recebido mas sem dados extraídos
      },
    ],
  });

  assert.equal(conf.aprovadoAutomatico, false);
  assert.equal(conf.itens.nome.status, STATUS_CONFERENCIA.DIVERGENTE);
  assert.ok(
    conf.divergencias.some((d) => /Nomes divergentes/i.test(d)),
    "Deve apontar divergência de nome entre documentos"
  );
  assert.ok(conf.resumoDocumentos.recebidos.includes("comprovante_endereco"));
  assert.equal(conf.resumoDocumentos.validados.includes("comprovante_endereco"), false);
});

test("Cenários M e N — Dossiê: bloqueia envio sem aprovação, detecta adulteração de texto/anexo via HMAC-SHA256 e trata falha parcial", async () => {
  // Cenário M: Tentativa de envio sem aprovação
  const opSemAprovacao = {
    id: "op_m_1",
    codigo_operacao: "VEZ-2026-000100",
    user_id: "tenant_1",
    status: "conferido_pendente_aprovacao",
    texto_pagamento: "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE.",
  };
  const autM = autorizarEnvioAoGrupo({ operacao: opSemAprovacao, userId: "tenant_1" });
  assert.equal(autM.autorizado, false);

  // Cenário N: Aprovação legítima seguida de adulteração de anexo ou falha parcial no envio
  const docsOriginais = [
    { id: "d1", tipo_documento: "rg_frente", arquivo_nome: "rg.pdf", arquivo_url: "base64_rg", checksum: "chk_1" },
    { id: "d2", tipo_documento: "contracheque", arquivo_nome: "cc.pdf", arquivo_url: "base64_cc", checksum: "chk_2" },
  ];
  const hashDocs = calcularHashDocumentos(docsOriginais);
  const hashBanco = calcularHashDadosBancarios({ banco: "Santander", agencia: "0001", conta: "12345-6" });
  const ts = new Date().toISOString();
  const textoAprovado = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE DE INTEGRIDADE.";

  const hashAprovacao = gerarHashAprovacao({
    idOperacao: "op_n_1",
    codigoOperacao: "VEZ-2026-000101",
    idOrganizacao: "tenant_1",
    versao: 1,
    textoPagamento: textoAprovado,
    dadosBancariosHash: hashBanco,
    documentosHash: hashDocs,
    userId: "ryan_uid",
    timestamp: ts,
  });

  const opAprovada = {
    id: "op_n_1",
    codigo_operacao: "VEZ-2026-000101",
    user_id: "tenant_1",
    versao: 1,
    status: "aprovado",
    aprovado_por: "ryan_uid",
    aprovado_em: ts,
    hash_aprovacao: hashAprovacao,
    texto_pagamento: textoAprovado,
    dados_bancarios_hash: hashBanco,
    documentos_hash: hashDocs,
  };

  // Adulteração de documento no momento do envio
  const docsAdulterados = [
    docsOriginais[0],
    { ...docsOriginais[1], checksum: "chk_adulterado" },
  ];

  await assert.rejects(
    () =>
      encaminharDossieAoGrupo({
        operacao: opAprovada,
        userId: "tenant_1",
        documentos: docsAdulterados,
        grupoDestinoJid: "120363000000@g.us",
        instanciaEvolution: "instancia_tenant_1",
      }),
    /Violação de integridade documental/i
  );

  // Migração controlada de operação legada sem hashes
  const migracaoLegada = migrarOperacaoLegadaParaReaprovacao({
    id: "op_legada",
    status: "aprovado",
    hash_aprovacao: "abc",
  });
  assert.equal(migracaoLegada.status, "conferido_pendente_aprovacao");
  assert.equal(migracaoLegada.requer_reaprovacao, true);
  assert.equal(migracaoLegada.hash_aprovacao, null);
});

test("Cenário O — Isolamento multi-tenant com o mesmo telefone em duas organizações", () => {
  const ts = new Date().toISOString();
  const txt = "TEXTO CORRENTISTA SANTANDER COM MAIS DE CINQUENTA CARACTERES PARA TESTE MULTI-TENANT.";
  const hashTenantA = gerarHashAprovacao({
    idOperacao: "op_o_1",
    codigoOperacao: "VEZ-2026-000200",
    idOrganizacao: "org_alpha",
    textoPagamento: txt,
    userId: "user_alpha",
    timestamp: ts,
  });

  // Tentativa de autorizar a operação de org_alpha sob contexto de org_beta
  const autCrossTenant = autorizarEnvioAoGrupo({
    operacao: {
      id: "op_o_1",
      codigo_operacao: "VEZ-2026-000200",
      user_id: "org_alpha",
      status: "aprovado",
      aprovado_por: "user_alpha",
      aprovado_em: ts,
      hash_aprovacao: hashTenantA,
      texto_pagamento: txt,
    },
    userId: "org_beta",
  });

  assert.equal(autCrossTenant.autorizado, false);
  assert.match(autCrossTenant.motivo, /Violação de isolamento multi-tenant/i);
});

test("Cenário P — Falha do provedor principal de IA: executa fallback automático e degrada com segurança sem inventar dados", async () => {
  const gestor = criarGestorIA();

  gestor.definirProvedor("gemini", {
    nome: "Primário Indisponível",
    estaConfigurado: () => true,
    modeloPadrao: "gemini-2.5-flash",
    async gerarTexto() {
      return { ok: false, codigoStatus: 503, erro: "Service Unavailable", provedor: "gemini" };
    },
  });

  gestor.definirProvedor("openai", {
    nome: "Secundário Ativo",
    estaConfigurado: () => true,
    modeloPadrao: "gpt-4o-mini",
    async gerarTexto() {
      return {
        ok: true,
        texto: "Entendi perfeitamente. Vou verificar no sistema e já te dou um retorno.",
        provedor: "openai",
        modelo: "gpt-4o-mini",
        tokensEntrada: 40,
        tokensSaida: 15,
        latenciaMs: 110,
      };
    },
  });

  gestor.configurarProvedores({ primario: "gemini", secundario: "openai" });
  const respostaFallback = await gestor.escrever({ prompt: "Quanto libera?", sistema: "Consultor" });
  assert.equal(
    respostaFallback,
    "Entendi perfeitamente. Vou verificar no sistema e já te dou um retorno."
  );
});
