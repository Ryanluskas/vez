# Vez — Relatório de Auditoria Profunda, Reestruturação do Motor Comercial, Segurança, Integrações e Validação de Ponta a Ponta

**Data:** 05/11/2026  
**Repositório:** `https://github.com/Ryanluskas/vez`  
**Escopo:** Auditoria técnica integral, reestruturação do motor conversacional e comercial, endurecimento criptográfico e LGPD, correção de integrações (`Botzapzap`, `Evolution API v2`, `WhatsApp Web / Playwright`, `Dossiê Santander`, multiprovedor de IA), correções no Painel Next.js e validação automatizada de ponta a ponta (485 testes no `motor` + build de produção no `painel`).

---

## Seção A — Resumo Executivo

### 1. Estado Anterior do Projeto
Na inspeção direta do código-fonte (`motor/`, `painel/`, `banco/`), constatou-se que o Vez possuía boa estrutura modular, porém apresentava falhas arquiteturais e conversacionais críticas que explicavam integralmente os problemas observados nos atendimentos reais pelo WhatsApp:
1. **Repetição cega de pedidos de documentos após recusa (`"Não"`)**: `motor/src/requisitos.js` e `motor/src/referencias.js` não rastreavam recusas nem a última pergunta feita pelo agente, fazendo o robô pedir o mesmo documento repetidas vezes.
2. **Despejo de formulário de 5 documentos e escolhas forçadas**: `montarPedido(memoria, { para: "fechar" })` despejava 5 documentos de uma só vez com pergunta de alternativa forçada (`"prefere me mandar agora ou mais tarde?"`), violando a regra de uma pergunta por vez.
3. **Reação inadequada a acusações graves de golpe e ameaças de denúncia**: `"Vocês dão golpes?"`, `"Puro golpe isso"` e `"Vou denunciar pra polícia"` recebiam textos institucionais longos ou continuavam no fluxo automático porque `decidir.js` permitia saída autônoma irrestrita para `decisao.categoria === "objecao"`.
4. **Promessas financeiras sem lastro (`1,40%`, `120 meses`, `"sem subir um centavo"`)**: `fluxo.js` injetava valores brutos de campanha do Botzapzap dentro de `memoria.guardarSimulacao` com taxa fixa `"1,40%"`, enquanto `respostas.js` (`permitirPersuasao`) e `redator.js` (`textoSemTermosComerciais`) possuíam brechas que deixavam esses números passarem sem conferência.
5. **Vulnerabilidades de segurança no Dossiê e nas integrações**: `aprovacao.js` possuía segredo HMAC hardcoded de fallback e aceitava SHA-256 puro sem chave (`calculadoLegado`); `encaminhador.js` possuía instância Evolution hardcoded (`"vez_8a44922bbd"`) e não validava o hash dos documentos no momento do disparo; `evolution_provedor.js` e `encaminhador.js` invocavam `evolution/cliente.js` com assinaturas incompatíveis; `painel/lib/dados.ts` consultava colunas inexistentes (`chave, valor`) na tabela `memoria`.

### 2. Estado Atual Após a Reestruturação
Todas as causas-raiz foram corrigidas diretamente no código-fonte:
- **Motor Conversacional e Comercial Consultivo**: Rastreamento explícito de `ultima_pergunta_agente`, `ultima_pergunta_cliente`, `recusas` e `objecoes_identificadas`; interpretação contextual de mensagens curtas (`"Não"`, `"Oi?"`, `"Que?"`, `"Como assim?"`); proibição absoluta de repetir pedido de item recusado; solicitação de **1 requisito por vez** em todas as etapas; escalonamento humano imediato (`so_voce = true`) em acusações graves de golpe ou ameaças de denúncia.
- **Barreira Financeira Inegociável**: Remoção de todas as brechas (`permitirPersuasao`, `textoSemTermosComerciais`, injeção de taxa `"1,40%"` via Botzapzap/Webhook/Painel). Toda simulação exige procedência verificada (`consultor`, `lista`, `ferramenta`), validade ativa (`expiraEm`) e conferência dígito a dígito.
- **Segurança Criptográfica e Isolamento Multi-Tenant**: Assinatura canônica **exclusivamente via HMAC-SHA256** com `crypto.timingSafeEqual`, *fail-closed* quando `DOSSIE_HMAC_SECRET` estiver ausente ou tiver menos de 32 caracteres, proteção contra replay (`nonce_aprovacao`, `aprovacao_consumida_em`), validação do hash dos anexos no momento do envio e rastreio de falha parcial (`status = "erro_envio_parcial"`).
- **Validação Executável**: **485 de 485 testes automatizados aprovados** no `motor` (incluindo a nova suíte `motor/test/regressao_conversacional_completa.test.js` cobrindo os Cenários A a P) e **build de produção Next.js aprovado sem erros** no `painel`.

---

## Seção B — Auditoria Técnica Completa

### 1. Arquitetura Real Mapeada
- **`motor/` (Node.js ESM)**:
  - Entrada e canais: `src/index.js`, `src/maestro.js`, `src/escuta.js`, `src/provedores/whatsapp_web_provedor.js`, `src/provedores/evolution_provedor.js`, `src/evolution/webhook.js`, `src/evolution/cliente.js`.
  - Núcleo conversacional e comercial: `src/fluxo.js`, `src/agente/classificar.js`, `src/agente/decidir.js`, `src/agente/planejar.js`, `src/agente/executar.js`, `src/agente/validar.js`, `src/memoria.js`, `src/requisitos.js`, `src/referencias.js`, `src/respostas.js`, `src/redator.js`, `src/valores.js`, `src/numeros.js`, `src/gatilhos.js`, `src/comercial/{objecoes,playbook,spin,qualificador,calculadora}.js`.
  - Dossiê e integrações: `src/dossie/{identificador,classificador,contratos,conferencia,montador,aprovacao,encaminhador,servico}.js`, `src/integracoes/botzapzap.js`, `src/lista.js`, `src/seguimento.js`.
- **`painel/` (Next.js 16 App Router + TypeScript + Supabase SSR)**:
  - Páginas operacionais: `app/(painel)/{visao-geral,conversas,fila,clientes,dossies,listas,modelos,configuracoes,conexao}/page.tsx`.
  - Camada de dados e Server Actions: `lib/dados.ts`, `lib/acoes-painel.ts`, `lib/acoes-ia.ts`, `lib/acoes.ts`.
- **`banco/` (Migrations SQL Supabase / PostgreSQL)**:
  - Migrations `01_tabelas.sql` a `26_consentimento_e_auditoria_lgpd.sql`, acrescidas agora da `27_estado_conversacional_e_seguranca_dossie.sql`.

### 2. Diagnóstico das Causas-Raiz dos Problemas Reais de Atendimento

| Problema Observado no Atendimento Real | Causa-Raiz Exata no Código | Correção Implementada |
|---|---|---|
| **1. Repetição de pedido após recusa (`"Não"` -> pede extrato -> `"Não"` -> pede extrato)** | `referencias.js` tratava `"Não"` isolado como neutro; `requisitos.js` não possuía registro de recusas nem filtrava itens recusados em `montarPedido`. | Criados `registrarRecusa`, `foiRecusado`, `ultimoRequisitoPerguntado` e `interpretarMensagemCurtaContextual`. Item recusado jamais é pedido novamente e o validador final barra qualquer insistência. |
| **2. Resposta institucional longa e tentativa de venda diante de `"Vocês dão golpes?"`, `"Puro golpe isso"`, `"Vou denunciar pra polícia"`** | `objecoes.js` agrupava acusações graves e dúvidas simples em `GOLPE_SEGURANCA`, e `decidir.js` liberava `categoria === "objecao"` em modo autônomo com textos longos em `respostas.js`. | Separados `RECLAMACAO_GRAVE` e `AMEACA_DENUNCIA` (`exigeHandoffHumano: true`), que interrompem a automação imediatamente, enviam mensagem curta de descompressão sem venda, travam `so_voce = true` e abrem pendência urgente. |
| **3. Ignorar `"Quanto libera?"` / `"Oi?"` e despejar 4–5 documentos; responder `"Que?"` com `"R$9, em 7 de R$6"`** | `montarPedido(memoria, { para: "fechar" })` pedia 5 itens de uma vez; `"Oi?"` e `"Que?"` não tinham resolução contextual; `redator.js` e `respostas.js` tinham bypasses (`permitirPersuasao` e `textoSemTermosComerciais`) que deixavam dígitos truncados saírem. | `montarPedido` agora pede **1 item por vez** em qualquer etapa; `"Oi?"` e `"Que?"` são resolvidos em contexto (`cobranca_ou_oi_contextual`, `pedido_esclarecimento`); removidos os bypasses do validador financeiro. |
| **4. Mudar de assunto quando o cliente diz `"Tenho que falar com a minha esposa"`** | A resposta de objeção ou o fluxo subsequente voltava a interrogar convênio/banco ou aplicava escassez artificial. | `CONVERSAR_FAMILIA` acolhe a decisão familiar em 1–2 frases naturais e oferece apenas um resumo simples, sem mudar de assunto e sem pressão. |
| **5. Tom agressivo, escassez artificial e promessas universais (`1,40%`, `120 meses`)** | `playbook.js`, `respostas.js`, `redator.js`, `fluxo.js` e `webhook.js` continham scripts de fechamento agressivo e injetavam `"1,40%"` / `"120 meses"` sem simulação real. | Reescritos `playbook.js`, `respostas.js`, `redator.js`, `fluxo.js`, `webhook.js` e `CentralAtendimento.tsx` para postura consultiva, humana e sem nenhum número não verificado. |

---

## Seção C — Correções no Motor Conversacional e Comercial

1. **[`motor/src/memoria.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/memoria.js)**:
   - Implementada hidratação bidirecional (`hidratar`) de estado conversacional (`recusas`, `objecoes_identificadas`, `ultima_pergunta_agente`, `ultima_pergunta_cliente`, `contexto_campanha`), compatível tanto com o JSONB `perguntado` quanto com as novas colunas da Migration 27.
   - Implementados `registrarUltimaPerguntaAgente`, `registrarUltimaPerguntaCliente`, `registrarRecusa`, `registrarObjecao` e `guardarContextoCampanha`.
   - `guardarSimulacao` agora grava procedência completa (`de`, `idFonte`, `autorizadoPor`, `em`, `expiraEm`, `valida`, `camposAutorizados`).
2. **[`motor/src/requisitos.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/requisitos.js)**:
   - Implementados `foiRecusado(memoria, chave)` e `ultimoRequisitoPerguntado(memoria)`.
   - `montarPedido` filtra qualquer item recusado e solicita **sempre 1 item por vez** (`MAXIMO_POR_MENSAGEM = 1`), eliminando o despejo de 5 documentos e a escolha forçada no fechamento.
3. **[`motor/src/referencias.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/referencias.js)**:
   - Adicionada `interpretarMensagemCurtaContextual(mensagem, memoria, conversa)` para interpretar `"Não"`, `"Oi?"`, `"Que?"`, `"Como assim?"` e `"Hã?"` em função da última pergunta feita pelo agente ou pelo cliente.
4. **[`motor/src/comercial/objecoes.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/comercial/objecoes.js)** e **[`motor/src/comercial/playbook.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/comercial/playbook.js)**:
   - Separadas `RECLAMACAO_GRAVE` e `AMEACA_DENUNCIA` (`exigeHandoffHumano: true`) de dúvidas objetivas de segurança (`GOLPE_SEGURANCA`).
   - Substituído o playbook agressivo por diretrizes consultivas, mantendo intactas as regras de divisão da CapitalCred (`50/50` para `>= R$ 8.000` e `62/38` para `< R$ 8.000`) e o CNPJ oficial (`53.093.082/0001-22`).
5. **[`motor/src/agente/decidir.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/agente/decidir.js)**:
   - Ordem de prioridade estrita: `opt_out / atender === false` -> `soVoce` -> `RECLAMACAO_GRAVE / AMEACA_DENUNCIA` (handoff imediato com `assumirManual: true`) -> tratamento consultivo de objeções -> `aguardando_voce / temPendenciaAberta` -> `precisaDoRyan` -> resposta normal.
   - Removido o bypass que liberava qualquer `objecao` em `podeAgirSozinho`.
6. **[`motor/src/respostas.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/respostas.js)**, **[`motor/src/redator.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/redator.js)**, **[`motor/src/valores.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/valores.js)** e **[`motor/src/agente/validar.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/agente/validar.js)**:
   - Removido `if (permitirPersuasao) return texto;` de `conferido()` em `respostas.js`.
   - Removida a sanitização `textoSemTermosComerciais` de `seguro()` em `redator.js` que permitia `"1,40%"` e `"120 meses"` sem fonte.
   - Adicionadas `insisteEmItemRecusado` e `promessaFinanceiraSemLastro` em `validarAntesDeEnviar` (`validar.js`).

---

## Seção D — Correções de Segurança, Consentimento e LGPD

1. **Aprovação e Integridade Criptográfica do Dossiê ([`motor/src/dossie/aprovacao.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/dossie/aprovacao.js))**:
   - Removido o segredo padrão hardcoded e removido o fallback de SHA-256 puro sem chave (`calculadoLegado`).
   - `obterSegredoHmac` exige `DOSSIE_HMAC_SECRET` com no mínimo 32 caracteres e rejeita chaves de exemplo/placeholder (*fail-closed*).
   - `autorizarEnvioAoGrupo` valida isolamento multi-tenant (`operacao.user_id === userId`), proteção contra replay (`status !== "encaminhado"`, `encaminhado_em`, `aprovacao_consumida_em`), expiração de 24h e assinatura `HMAC-SHA256` via `crypto.timingSafeEqual`.
   - Adicionada `migrarOperacaoLegadaParaReaprovacao(operacao)` para converter registros legados sem HMAC válido para `conferido_pendente_aprovacao` sem aprová-los automaticamente.
2. **Consentimento, Opt-Out LGPD e Controle Humano ([`motor/src/fluxo.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/fluxo.js), [`motor/src/escuta.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/escuta.js))**:
   - Pedido explícito de opt-out (`"pare"`, `"não quero mais mensagens"`, `"tirar meu número"`) marca `opt_out = true`, `atender = false`, `seguir = false`, `etapa = "perdido"`, cancela follow-ups pendentes e grava auditoria em `consentimento_historico`.
   - Mensagens neutras como `"Oi"` de contato em opt-out **não** reativam o atendimento; apenas manifestação explícita de retomada (`querRetomarExplicito`) revoga o opt-out com registro de `opt_in_reativacao`.
   - Conversas com `so_voce === true` permanecem sob controle exclusivo do consultor até liberação manual no Painel.

---

## Seção E — Correções nas Integrações

1. **Botzapzap e Listas ([`motor/src/integracoes/botzapzap.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/integracoes/botzapzap.js), [`motor/src/lista.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/lista.js), [`motor/src/fluxo.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/fluxo.js))**:
   - Corrigida a colisão de sufixo de 8 dígitos entre DDDs diferentes (`decomporTelefone` e `selecionarRegistroSemColisao` exigem compatibilidade de DDD e unicidade).
   - O enriquecimento de campanha do Botzapzap agora grava apenas `nome` e `contexto_campanha`, sem fabricar simulação verificada nem injetar taxa `"1,40%"`.
   - `lista.js` agora filtra consultas de `listas` e `itens_da_lista` por `user_id` do tenant.
2. **Evolution API v2 e Provedor ([`motor/src/evolution/cliente.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/evolution/cliente.js), [`motor/src/provedores/evolution_provedor.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/provedores/evolution_provedor.js), [`motor/src/evolution/webhook.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/evolution/webhook.js))**:
   - Normalizadas as assinaturas de `enviarTexto` e `enviarMedia` em `evolution/cliente.js` para aceitar tanto `{ nomeInstancia, numero, texto }` quanto `{ instancia, para, texto }`.
   - Corrigidas as chamadas em `evolution_provedor.js` (`obterEstadoConexao({ nomeInstancia })` e `enviarTexto({ nomeInstancia, numero, texto })`).
   - Removida a injeção de taxa `"1,40%"` e `"sem subir um centavo"` em `evolution/webhook.js`.
3. **Encaminhador e Conferência do Dossiê ([`motor/src/dossie/encaminhador.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/dossie/encaminhador.js), [`motor/src/dossie/contratos.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/dossie/contratos.js), [`motor/src/dossie/conferencia.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/src/dossie/conferencia.js))**:
   - Removido o default hardcoded `"vez_8a44922bbd"` de `encaminhador.js`.
   - Adicionada verificação de integridade dos anexos (`calcularHashDocumentos(documentos) === operacao.documentos_hash`) antes do envio ao grupo.
   - Adicionado controle de idempotência (`documentos_enviados`, `texto_pagamento_enviado`) e tratamento de falha parcial (`status: "erro_envio_parcial"`).
   - `contratos.js` consolida campos de um mesmo contrato distribuídos em múltiplas páginas e extrai `saldoDevedor`.
   - `conferencia.js` valida consistência de nome entre documentos e diferencia documentos `recebidos` de `validados`.

---

## Seção F — Correções no Painel

1. **[`painel/lib/dados.ts`](file:///c:/Users/Ryyan/Downloads/vez/painel/lib/dados.ts)**:
   - Corrigida `obterFatosDaConversa`, que antes consultava colunas inexistentes (`select("chave, valor, origem, atualizado_em")`) na tabela `memoria` e retornava sempre vazio. Agora lê o registro real da tabela `memoria` e exibe nome, convênio, banco, objetivo, etapa comercial, documentos recebidos, recusas registradas, última pergunta do agente e simulação.
2. **[`painel/app/(painel)/conversas/page.tsx`](file:///c:/Users/Ryyan/Downloads/vez/painel/app/%28painel%29/conversas/page.tsx)** e **[`painel/components/conversas/CentralAtendimento.tsx`](file:///c:/Users/Ryyan/Downloads/vez/painel/components/conversas/CentralAtendimento.tsx)**:
   - Incluídos `opt_out, opt_out_em, motivo_opt_out, origem_contato, observacoes, motivo_perda` na query de conversas.
   - Removida a promessa `"sem subir um centavo"` do template de proposta calculada na Central de Atendimento.
3. **[`painel/app/(painel)/visao-geral/page.tsx`](file:///c:/Users/Ryyan/Downloads/vez/painel/app/%28painel%29/visao-geral/page.tsx)**:
   - Status de conexão agora distingue `"Conectado · Motor Ativo"` (batimento recente), `"Registrado · Sem Batimento Recente"` e `"Offline"`.
4. **[`painel/lib/acoes-painel.ts`](file:///c:/Users/Ryyan/Downloads/vez/painel/lib/acoes-painel.ts)**:
   - Removida a chave hardcoded de fallback da Evolution API em `apagarConexao`.
   - Adicionado filtro `.eq("user_id", usuario.id)` em `alternarAtendimento`.

---

## Seção G — Banco de Dados e Migrations

Foi criada a migration idempotente e reversível **[`banco/27_estado_conversacional_e_seguranca_dossie.sql`](file:///c:/Users/Ryyan/Downloads/vez/banco/27_estado_conversacional_e_seguranca_dossie.sql)** (não executada contra o banco de produção, conforme restrições de segurança):
- **Tabela `public.memoria`**: adiciona `recusas` (`jsonb`), `objecoes_identificadas` (`jsonb`), `ultima_pergunta_agente` (`text`), `ultima_pergunta_cliente` (`text`) e `contexto_campanha` (`jsonb`).
- **Tabela `public.operacoes_pagamento`**: adiciona `aprovacao_consumida_em` (`timestamptz`), `nonce_aprovacao` (`text`), `texto_pagamento_enviado` (`boolean`), `documentos_enviados` (`jsonb`), `erro_envio` (`text`), `requer_reaprovacao` (`boolean`) e `motivo_reaprovacao` (`text`).
- **Constraints e Índices**: atualiza `operacoes_pagamento_status_check` para incluir `'erro_envio_parcial'` e `'conferido_pendente_aprovacao'`; cria `idx_operacoes_pagamento_status_tenant` e índice único `idx_operacoes_pagamento_nonce_unico`; invalida de forma controlada aprovações legadas sem `documentos_hash` ou `dados_bancarios_hash`.

---

## Seção H — Testes Executados e Evidências

### 1. Suíte Completa do Motor (`npm test --prefix motor`)
- **Total de testes executados:** `485`
- **Aprovados:** `485` (`100%`)
- **Falhas:** `0`
- **Duração:** `~9.1s`

### 2. Nova Suíte de Regressão Conversacional e Segurança ([`motor/test/regressao_conversacional_completa.test.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/test/regressao_conversacional_completa.test.js))
Todos os cenários obrigatórios (A a P) foram implementados e validados:
- **Cenário A**: Recusa repetida de documento (`"Não"`) -> registra recusa, não repete o pedido e bloqueia insistência no validador final.
- **Cenário B**: Acusação de golpe (`"Vocês dão golpes?"`, `"Puro golpe isso"`) -> zero tentativa de venda, ativa `so_voce = true` e escala ao humano.
- **Cenário C**: Ameaça de denúncia (`"E vou denunciar pra polícia"`) -> interrompe automação imediatamente e silencia robô nas mensagens seguintes.
- **Cenário D**: `"Quanto libera?"` seguido de `"Oi?"` -> responde em contexto sem despejar lista de 4/5 documentos.
- **Cenário E**: `"Que?"` após mensagem anterior -> esclarece em linguagem simples e barra números desconexos como `"R$9, em 7 de R$6"`.
- **Cenário F**: `"Não sei, tenho que falar com a minha esposa"` -> valida decisão familiar sem mudar de assunto para questionário de INSS/servidor.
- **Cenário G**: `"Me dá um dinheiro aí"` -> não usa template agressivo nem inventa valores.
- **Cenários H, I e J**: Ciclo completo de opt-out LGPD (`"Pare de me mandar mensagem"` -> bloqueia; `"Oi"` -> mantém bloqueado; `"Oi, quero fazer de novo a simulação"` -> reativa com log de consentimento).
- **Cenário K**: Campanha Botzapzap -> preserva isolamento entre DDDs distintos com mesmo sufixo de 8 dígitos e bloqueia `"1,40%"` / `"120 meses"` sem simulação real.
- **Cenário L**: Documentos multi-página e incompletos -> consolida contrato entre páginas, diferencia `recebido` de `validado` e detecta divergência de titularidade.
- **Cenários M e N**: Dossiê -> bloqueia envio sem aprovação, detecta adulteração de anexo via `HMAC-SHA256` e migra operação legada para reaprovação.
- **Cenário O**: Isolamento multi-tenant com o mesmo telefone em duas organizações.
- **Cenário P**: Falha do provedor primário de IA -> executa fallback automático para o secundário sem inventar dados.

### 3. Build de Produção do Painel (`npm run build --prefix painel`)
- Verificação de Server Actions (`scripts/conferir-server-actions.mjs`): aprovada (`3 arquivo(s) "use server" — só funções async exportadas`).
- Compilação Next.js 16.3.0 (Turbopack) + TypeScript: aprovada com zero erros.

---

## Seção I — Revisão Independente Final

Foi realizada uma revisão independente sobre todas as alterações aplicadas:
1. **Nenhum número financeiro sai sem fonte autorizada**: Verificado em `valores.js`, `numeros.js`, `respostas.js`, `redator.js` e `agente/validar.js`. Todos os bypasses anteriores foram removidos.
2. **Nenhum segredo exposto ou hardcoded**: Removidos os fallbacks de segredo em `aprovacao.js`, `encaminhador.js` e `acoes-painel.ts`.
3. **Compatibilidade retroativa de banco**: `memoria.js` funciona mesmo antes da execução da Migration 27 no Supabase, pois persiste metadados conversacionais também dentro do campo JSONB `perguntado`, além de hidratar as novas colunas assim que a Migration 27 for aplicada.
4. **Riscos Residuais Monitorados**:
   - Caso o operador envie uma proposta manualmente diretamente pelo aparelho celular (fora do Painel) sem mencionar o banco ou prazo, o webhook registra apenas os valores efetivamente digitados pelo operador, sem inventar taxas ou prazos não escritos.

---

## Seção J — Checklist Operacional para Entrar em Produção

1. **Variáveis de Ambiente Obrigatórias (`motor/.env` e Vercel)**:
   - `DOSSIE_HMAC_SECRET`: chave exclusiva e aleatória com pelo menos 32 caracteres (ex.: gerada via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   - `PILOTO_TELEFONES_AUTORIZADOS`: lista de telefones autorizados separados por vírgula para o piloto controlado.
   - `GRUPO_PAGAMENTO_JID`: JID oficial do grupo de pagamento (`...@g.us`).
   - `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET`.
2. **Banco de Dados (Supabase)**:
   - Aplicar `banco/26_consentimento_e_auditoria_lgpd.sql` (se ainda não aplicada) e `banco/27_estado_conversacional_e_seguranca_dossie.sql` no SQL Editor do Supabase.
3. **Configuração Inicial Recomendada no Painel**:
   - Iniciar o piloto em modo **Assistido** ou com `PILOTO_TELEFONES_AUTORIZADOS` restrito a 5–10 contatos reais supervisionados.
   - Configurar provedor primário e secundário de IA na tela de Modelos de IA.
4. **Plano de Contingência**:
   - Pausa global imediata: botão de desativação do agente no Painel ou limpeza de `PILOTO_TELEFONES_AUTORIZADOS`.
   - Pausa por conversa: ativar `"Assumir conversa"` (`so_voce = true`) na Central de Atendimento.

---

## Seção K — Veredito Final

**APROVADO PARA PILOTO CONTROLADO EM PRODUÇÃO**

O Vez passou por reestruturação completa do motor conversacional e comercial, endurecimento criptográfico (`HMAC-SHA256` exclusivo), blindagem financeira sem brechas, correção de integrações e validação automatizada integral (**485/485 testes aprovados no motor** e **build de produção limpo no painel**), estando tecnicamente pronto para iniciar operação em piloto controlado.
