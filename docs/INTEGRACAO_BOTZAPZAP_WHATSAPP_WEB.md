# VEZ — INTEGRAÇÃO BOTZAPZAP + WHATSAPP WEB PLAYWRIGHT + AGENTE COMERCIAL AUTOMÁTICO

**Data:** 02 de Novembro de 2026  
**Status do Projeto:** Implementado, Integrado e Validado  
**Suíte de Testes:** 462 testes passando (100% de sucesso)  
**Build do Painel:** Next.js 16 (21 rotas compiladas com sucesso)

---

## 1. Diagnóstico da Arquitetura dos Projetos

### 1.1. Botzapzap (`d:\01_Projetos\Programacao\Bots_Automacoes\whatsapp-bot-master`)
- **Tecnologia:** Aplicação em Python (Flask + Selenium WebDriver) voltada para prospecção ativa e disparo em massa.
- **Armazenamento de Sessão:** Utiliza diretórios de perfil do Google Chrome (`chrome_profile` para o Slot 0 e `chrome_profile_1..N` para múltiplos slots).
- **Identificação de Contatos e Disparos:**
  - `contatos_enviados.json`: Dicionário com chaves em formato canônico (`+55...`), contendo `identificacao`, `numero`, `modo` (nome da campanha/estratégia, ex: "Personalizada", "Consultor") e timestamp `ultimo_envio`.
  - `contatos_dados.json`: Base enriquecida extraída das planilhas de consignado (`com_refinanciamento.xlsx`, etc.), contendo `nome`, `primeiro_nome`, `cpf`, `ddd`, `uf`, `estado`, `lib` (limite pré-calculado liberado), `valor`, `valor_fmt`, `faixa` ("alta", "media", "baixa", "premium").
  - `historico_envios.txt`: Log sequencial com timestamp, identificação, número e status de entrega.
- **Escopo e Papel:** O Botzapzap realiza estritamente os **disparos iniciais** da campanha. Ele não realiza atendimento conversacional inteligente, qualificação comercial ou condução de fechamento.

### 1.2. Vez (`c:\Users\Ryyan\Downloads\vez`)
- **Tecnologia:** Motor inteligente em Node.js (ESM), backend Supabase PostgreSQL com isolamento multi-tenant (RLS) e painel moderno em Next.js (Tailwind CSS, design Apple-Grade).
- **Regras Comerciais:** Orquestrador determinístico com as regras da CapitalCred (redução de juros a 1,40%, 120 meses, cálculo de valor líquido para o cliente), barreira estrita da **Regra de Ouro** (proibição de alucinação de valores pela IA), coleta obrigatória de 5 documentos para formalização, detecção de objeções persuasivas (SPIN Selling), e dossiê de pagamento criptografado via HMAC SHA-256 (`DOSSIE_HMAC_SECRET`).
- **Escopo e Papel:** O Vez atua após o término da campanha, assumindo o atendimento imediato e natural de cada contato que responder.

---

## 2. Como Botzapzap e Vez se Comunicam (Contrato de Integração)

A comunicação entre os projetos foi desenhada de forma **desacoplada, resiliente e segura**, sem acoplamento frágil de banco de dados compartilhado ou injeção invasiva de processos:

```
┌─────────────────────────────────────────────────────────────────┐
│                     1. DISPARO DE CAMPANHA                      │
│                           (Botzapzap)                           │
│  - Realiza disparos utilizando perfis do Chrome                │
│  - Registra histórico em contatos_enviados.json                 │
│  - Mantém dados cadastrais e simulações em contatos_dados.json  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ Arquivos JSON imutáveis com lock e cache mtime
┌─────────────────────────────────────────────────────────────────┐
│               2. PONTE DE INTEGRAÇÃO NO VEZ                     │
│               (motor/src/integracoes/botzapzap.js)              │
│  - Normalização com Suffix-Matching de 8 dígitos               │
│  - Extrai: campanha (modo), timestamp do disparo, dados do lead │
│  - Lê limite pré-calculado da planilha (lib/valorFmt)           │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ Contexto Comercial Injetado
┌─────────────────────────────────────────────────────────────────┐
│                  3. ATENDIMENTO COMERCIAL VEZ                   │
│                    (motor/src/fluxo.js)                         │
│  - Valida Marco Temporal (somente respostas pós-ativação)       │
│  - Detecta Opt-out LGPD vs Objeção comercial                   │
│  - Não pergunta o que já sabe (banco, convênio Santander)      │
│  - Responde naturalmente e conduz para coleta de documentos     │
└─────────────────────────────────────────────────────────────────┘
```

### Funções do Contrato de Integração (`motor/src/integracoes/botzapzap.js`):
1. `buscarContextoCampanha(telefone)`: Retorna se o contato pertence a alguma campanha recente, o nome da campanha (`modo`), data/hora do disparo e os dados enriquecidos do cliente (`nome`, `cpf`, `uf`, `liberacaoEstimada`, `valorFmt`, `faixa`).
2. `contatoPertenceACampanha(telefone)`: Booleano rápido para decisões de triagem.
3. `obterRelatorioCampanhas()`: Retorna métricas consolidadas dos disparos para exibição no painel.

---

## 3. WhatsApp Web com Playwright (`motor/src/provedores/whatsapp_web_playwright.js`)

Para eliminar dependências externas obrigatórias (como Docker ou WSL) e permitir acompanhamento visual direto pelo operador, foi desenvolvida uma camada independente de WhatsApp Web utilizando **Playwright**:

- **Contexto Persistente:** Utiliza `chromium.launchPersistentContext()` apontando para `.sessao_whatsapp_web` (ou perfil configurado), preservando a sessão autenticada após reinicializações.
- **Binário Nativo do Sistema:** Detecta automaticamente a instalação do Google Chrome local no Windows (`C:\Program Files\Google\Chrome\Application\chrome.exe`), evitando downloads redundantes de binários pesados.
- **Monitoramento Operacional em Tempo Real:** O navegador opera com `headless: false` por padrão (customizável via `WHATSAPP_WEB_HEADLESS=true`), permitindo ao operador visualizar o WhatsApp Web aberto na tela e acompanhar o fluxo.
- **Autenticação por QR Code:** Detecta automaticamente o QR Code no DOM do WhatsApp Web, emitindo o evento para a interface e sincronizando o estado com o Supabase (`conexoes.estado = 'aguardando_qr'`).
- **Camada Isolada de Seletores (`seletores_whatsapp.js`):** Utiliza um catálogo desacoplado com fallbacks automáticos para:
  - Caixa de composição de mensagens (`data-testid="conversation-compose-box-input"`, `contenteditable`, etc.)
  - Botão de envio (`compose-btn-send`, `span[data-icon="send"]`)
  - Indicadores de reconexão e instabilidade de rede (`toast-disconnected`, `network-status-banner`)
- **Deduplicação Estrita:** Cache LRU em memória com hash SHA-256 por mensagem e contato, impedindo que reentregas de eventos do WhatsApp gerem respostas duplicadas.
- **Fila Serializada por Conversa (FIFO):** Cada conversa possui sua própria promessa encadeada para envio, garantindo que mensagens de um mesmo cliente nunca se atropelem na interface.
- **Proteção de Segredos:** Cookies, tokens de sessão e localStorage nunca são expostos em logs, consoles ou relatórios.

---

## 4. Arquitetura Multiprovedor de WhatsApp

A integração com a **Evolution API v2 NÃO foi removida**. Em vez disso, foi implementada uma arquitetura unificada de provedores:

- `ProvedorWhatsAppBase`: Classe abstrata com eventos padronizados (`estado_mudou`, `qr_recebido`, `mensagem_recebida`, `erro`).
- `EvolutionProvider`: Adapter para Evolution API v2 (contêineres Docker/WSL).
- `WhatsAppWebPlaywrightProvider`: Provedor nativo via Playwright.
- `GestorProvedor`: Permite alternância transparente via variável de ambiente:
  ```env
  WHATSAPP_PROVEDOR=whatsapp_web   # Para usar Playwright com Chromium
  # ou
  WHATSAPP_PROVEDOR=evolution      # Para usar Evolution API v2
  ```

---

## 5. Marco Temporal de Ativação (`motor/src/marco_ativacao.js`)

Para atender com rigor ao requisito mandatório de não responder retroativamente a mensagens antigas:

- Ao ligar o agente Vez no painel ou no terminal, o sistema registra um **Marco Temporal de Ativação** confiável (`Date.now()`).
- O estado e o timestamp são persistidos localmente (`.marco_ativacao.json`) e sincronizados com o banco Supabase.
- **Regra de Bloqueio:** Mensagens recebidas com timestamp anterior ao marco de ativação são gravadas no histórico para consulta e modo de revisão no painel, mas **NUNCA acionam a IA nem disparam respostas automáticas**.
- **Segurança pós-reinício:** Caso o motor seja reiniciado, o marco de ativação é lido do arquivo persistido, garantindo que mensagens anteriores à reinicialização não recebam disparos duplicados.

---

## 6. Painel de Controle e Experiência do Operador

O painel Next.js foi evoluído para oferecer a visualização clara dos três estados independentes:

### 6.1. Três Dimensões de Estado
1. **Conexão:** `Conectado` (Verde), `Desconectado` (Neutro), `Reconectando` (Amarelo), `Aguardando QR Code` (Laranja), `Erro` (Vermelho).
2. **Agente Global:** `Ligado` (com badge de horário de ativação) / `Desligado` (Pausado).
3. **Estado Individual da Conversa:**
   - `IA Ativa`: Atendimento comercial fluindo autonomamente com as regras CapitalCred.
   - `IA Pausada`: IA temporariamente pausada para este contato específico.
   - `Atendimento Humano` (`so_voce: true`): Operador assumiu o chat no WhatsApp ou painel.
   - `Opt-Out Ativo`: Bloqueio estrito de compliance LGPD (proibido responder).
   - `Não Responder` / `Arquivada`: Conversa finalizada ou desqualificada.

### 6.2. Ações Operacionais Disponíveis
- **Controle Global do Agente:** Botão de ativação com registro de marco temporal na tela `/conexao`.
- **Ações Rápidas no Dossiê Lateral (`CentralAtendimento.tsx`):**
  - Pausar IA / Retomar IA individual.
  - Assumir Chat (`so_voce: true`) / Devolver ao Vez.
  - Marcar como "Não Responder".
  - Arquivar conversa.
  - Campo de **Observações Internas** privadas da equipe.
  - **Exclusão Local no Vez:** Exclui o lead e histórico do banco local do Vez com confirmação explícita, sem tocar no WhatsApp do cliente.

---

## 7. Resultados da Suíte de Testes dos 20 Cenários Obrigatórios

Arquivo de teste: [`motor/test/integracao_botzapzap_playwright.test.js`](file:///c:/Users/Ryyan/Downloads/vez/motor/test/integracao_botzapzap_playwright.test.js)

| Nº | Cenário Testado | Método de Validação | Resultado |
| :---: | :--- | :--- | :---: |
| **1** | Conexão inicial por QR Code | Emissão do evento `qr_recebido` e transição para `aguardando_qr` | **APROVADO** |
| **2** | Persistência da sessão após reinício | Leitura do diretório de contexto persistente `.sessao_whatsapp_web` | **APROVADO** |
| **3** | Reconexão do navegador | Transição do estado para `reconectando` e desativação de flag | **APROVADO** |
| **4** | Recebimento de mensagem | Callback normalizado com texto, telefone e `deMim: false` | **APROVADO** |
| **5** | Identificação correta do contato | Suffix matching de 8 dígitos (+55, DDD, nono dígito) | **APROVADO** |
| **6** | Integração com campanha Botzapzap | Extração de nome, modo, valor pré-calculado e limite da planilha | **APROVADO** |
| **7** | Ativação do Vez pós-disparos | Registro de timestamp confiável e operador responsável | **APROVADO** |
| **8** | Bloqueio de mensagens pré-ativação | Mensagens anteriores ao marco são bloqueadas sem resposta | **APROVADO** |
| **9** | Resposta automática a nova mensagem | Decisão comercial da CapitalCred aprovada com categoria | **APROVADO** |
| **10** | Deduplicação de mensagens | Hash SHA-256 descarta repetições imediatas do WhatsApp | **APROVADO** |
| **11** | Duas conversas simultâneas | Execução concorrente comprovada sem bloqueio mútuo | **APROVADO** |
| **12** | Mensagens simultâneas na mesma conversa | Fila FIFO respeita ordenação cronológica rigorosa | **APROVADO** |
| **13** | Pausa individual (`atender: false`) | Silencia processamento automático da IA para a conversa | **APROVADO** |
| **14** | Atendimento humano (`so_voce: true`) | Transfere controle imediato ao consultor (`acao: aguardar`) | **APROVADO** |
| **15** | Opt-out explícito | Reconhece pedido de descadastramento e bloqueia atendimento | **APROVADO** |
| **16** | Reinício sem duplicar respostas | Leitura do marco persistido sobrevivendo ao reboot | **APROVADO** |
| **17** | Falha do provedor de IA | Degradação graciosa sem crash, encaminhando à Fila de Triage | **APROVADO** |
| **18** | Falha do navegador durante atendimento | Captura de fechamento e transição para estado `desligado` | **APROVADO** |
| **19** | Contato fora da campanha | Identifica `pertenceCampanha: false` e trata adequadamente | **APROVADO** |
| **20** | Isolamento multi-tenant | Chaves compostas (`user_id:id_conexao:telefone`) sem vazamento | **APROVADO** |

*Resultado geral de testes do motor:* **462 testes passando (100% de sucesso, 0 falhas)**.

---

## 8. Limitações e Riscos da Automação via WhatsApp Web

> [!WARNING] **Limitações Técnicas e Riscos Operacionais:**
> 1. **Engenharia Reversa de Interface:** O WhatsApp Web não é uma API pública documentada. A Meta atualiza com frequência classes CSS, hashes de componentes e mecanismos de encriptação local.
> 2. **Risco de Restrição de Linha:** O envio automatizado através do navegador pode sofrer bloqueios temporários caso o volume de envios seja desproporcional ou haja denúncias de spam.
> 3. **Concorrência de Perfil do Chrome:** O diretório de perfil (`--user-data-dir`) é travado pelo Chrome em nível de sistema operacional. Portanto, o operador deve encerrar a janela do Botzapzap antes de iniciar a sessão do WhatsApp Web no Vez com o mesmo perfil, ou manter perfis isolados.
> 4. **Alternativa Corporativa:** Para operações em escala empresarial com alta volumetria, recomenda-se a migração futura para a **WhatsApp Business Platform (Cloud API Oficial)**, que oferece estabilidade contratual, webhooks oficiais e ausência de riscos de bloqueio por automação de tela.

---

## 9. Próximas Etapas para Iniciar o Piloto Controlado

1. **Configuração de Ambiente:** No arquivo `motor/.env`:
   ```env
   WHATSAPP_PROVEDOR=whatsapp_web
   WHATSAPP_WEB_HEADLESS=false
   BOTZAPZAP_DIR=d:\01_Projetos\Programacao\Bots_Automacoes\whatsapp-bot-master
   ```
2. **Execução da Campanha no Botzapzap:** O operador realiza a campanha de mensagens normalmente.
3. **Ativação do Vez:**
   - Inicia o motor (`npm start --prefix motor` ou via `Vez.bat`).
   - O Chromium abrirá na tela exibindo o WhatsApp Web.
   - O operador escaneia o QR Code caso ainda não esteja autenticado.
   - No painel do Vez, o operador clica em **"Ligar Agente Vez"** para fixar o marco temporal de ativação.
4. **Monitoramento:** As respostas dos clientes que interagirem com a campanha serão atendidas automaticamente pelo Vez, exibindo no painel o badge `Botzapzap` e todos os dados comerciais pré-calculados.
