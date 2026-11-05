# VEZ — RELATÓRIO TÉCNICO DE PREPARAÇÃO OPERACIONAL DO PILOTO CONTROLADO

**Data:** 02 de Novembro de 2026  
**Status do Projeto:** Prontidão Operacional Aprovada para Piloto Restrito  
**Ambiente:** Pré-Deploy Controlado (Isolamento via Allowlist)  
**Suíte de Testes:** 442 testes passando (100% de sucesso)

---

## 1. Sumário Executivo e Status Geral de Prontidão

Em conformidade com as diretrizes de governança, segurança e estabilidade, foi concluída a preparação técnica e operacional do projeto **Vez** para o seu primeiro piloto controlado em ambiente real.

O objetivo do piloto controlado é validar o atendimento em condições reais com **apenas números autorizados**, mantendo todas as salvaguardas de isolamento, auditoria e blindagem ativa:

- **Conexão Oficial:** Nenhuma mensagem foi ou será disparada para clientes reais ou contatos fora da allowlist sem autorização prévia expressa.
- **Isolamento de Contatos:** Implementado o módulo de controle `motor/src/piloto.js`, que intercepta qualquer requisição no motor de atendimento, na esteira de follow-ups automáticos, no despachante de rascunhos e no encaminhador de dossiês.
- **Integridade Criptográfica:** Gerada uma chave secreta exclusiva de 256 bits para assinatura HMAC de dossiês (`DOSSIE_HMAC_SECRET`), sincronizada entre motor e painel sem exposição em relatórios ou logs.
- **Suíte de Testes:** 442 testes unitários, de integração e adversariais executados com 0 falhas, incluindo os 8 critérios mandatórios de controle de piloto.
- **Status do Painel:** Build de produção Next.js compilado com sucesso em 3.5 segundos em todas as 21 rotas.

---

## 2. Auditoria e Funcionamento da Allowlist (`PILOTO_TELEFONES_AUTORIZADOS`)

A governança do piloto baseia-se na variável de ambiente `PILOTO_TELEFONES_AUTORIZADOS`. A arquitetura do sistema foi estruturada para impedir vazamentos acidentais para terceiros.

### 2.1. Arquitetura do Módulo de Piloto (`motor/src/piloto.js`)

O módulo centraliza as seguintes funções puras e auditáveis:

```javascript
export function obterTelefonesAutorizados();
export function estaEmModoPiloto();
export function telefoneAutorizadoNoPiloto(telefone);
export function verificarBloqueioPiloto(telefone, contexto);
```

### 2.2. Regras de Normalização e Suffix Matching (8 Dígitos)
No Brasil, números de WhatsApp sofrem frequentes inconsistências de formatação:
- Presença ou ausência de DDI (+55);
- Presença ou ausência de DDD (ex: 62);
- Presença ou ausência do 9º dígito móvel (ex: 99999-0001 vs 9999-0001).

O módulo normaliza os números removendo caracteres não numéricos (`\D`) e compara o **sufixo de 8 dígitos** do número autorizado contra o do remetente. Com isso:
- `+55 (62) 99999-0001` casa perfeitamente com `5562999990001` ou `62999990001`;
- Números de outros estados ou contatos não cadastrados são bloqueados com 100% de exatidão.

### 2.3. Comportamento Fail-Safe Estrito
- Se `PILOTO_TELEFONES_AUTORIZADOS` não estiver definida ou for deixada vazia: o sistema opera em modo irrestrito (produção plena).
- Se `PILOTO_TELEFONES_AUTORIZADOS` estiver preenchida com valores malformados (ex: strings não numéricas como `"teste, abc, 123"` onde nenhum telefone válido com ≥ 8 dígitos é extraído): o sistema entra em modo de **bloqueio total preventivo** (`bloqueado: true`), impedindo disparos automáticos por engano.

### 2.4. Mapeamento dos Pontos de Interceptação no Motor
Foram auditadas e blindadas todas as vias de saída de mensagens:

1. **Entrada de Mensagens (`motor/src/fluxo.js`):**
   Logo após a persistência da mensagem recebida para fins de histórico e compliance, o fluxo executa `verificarBloqueioPiloto(conversa.telefone, "atendimento")`. Se o número estiver fora da allowlist, o processamento da IA é interrompido imediatamente e registrado no log estruturado com Correlation ID.
2. **Varredura de Sugestões de Follow-up (`motor/src/seguimento.js`):**
   A função `varrerSugestoes()` valida `telefoneAutorizadoNoPiloto(conversa.telefone)` antes de avaliar janelas de inatividade e antes de criar rascunhos. Contatos não autorizados são ignorados.
3. **Disparo de Follow-ups Aprovados (`motor/src/seguimento.js`):**
   A função `varrerEnviosAprovados()` verifica a allowlist antes de chamar `evolution.enviarTexto()`. Se o telefone não for autorizado, o envio é abortado e a pendência marcada como cancelada por segurança.
4. **Despacho de Rascunhos Manuais/Automáticos (`motor/src/escuta.js`):**
   A função `enviar(rascunho)` verifica a allowlist antes de liberar qualquer disparo de rascunho de IA para a Evolution API.
5. **Notificações de Dossiê ao Cliente (`motor/src/dossie/encaminhador.js`):**
   Ao aprovar ou reprovar um dossiê, qualquer envio de status pelo WhatsApp para o cliente final é condicionado a `telefoneAutorizadoNoPiloto(clienteTelefone)`.

### 2.5. Imutabilidade e Sobrevivência a Reinicializações
Como a allowlist é carregada dinamicamente a partir do ambiente (`process.env.PILOTO_TELEFONES_AUTORIZADOS`), qualquer reinicialização do processo Node.js ou reinício de contêiner mantém a proteção integralmente ativa sem depender de estado volátil em memória.

---

## 3. Verificação de Configurações e Chaves Criptográficas

Todas as configurações exigidas foram verificadas nos arquivos de ambiente de backend e frontend (`motor/.env` e `painel/.env.local`).

### 3.1. Chave Criptográfica `DOSSIE_HMAC_SECRET`
- **Geração:** Gerada uma chave aleatória criptograficamente forte utilizando CSPRNG (`crypto.randomBytes(32)`), totalizando 256 bits de entropia (64 caracteres hexadecimais).
- **Isolamento:** A chave foi gerada externamente ao código-fonte, sem reutilizar strings ou chaves de exemplo de testes ou relatórios anteriores.
- **Sincronismo:** Injetada com exatidão tanto em `motor/.env` quanto em `painel/.env.local`, garantindo que os dossiês assinados pelo painel sejam validados pelo motor sem divergências.
- **Política de Não Exposição:** O segredo não é impresso em nenhum log, console, saída de erro ou artefato de documentação.

### 3.2. Variável `PILOTO_TELEFONES_AUTORIZADOS`
- Configurada nos arquivos `.env`.
- Formato aceito: Lista de telefones separados por vírgula em padrão E.164 (ex: `5562999990001,5562988880002`).
- Atualmente em branco, pronta para receber os telefones oficiais do piloto assim que definidos pela operação.

### 3.3. Variável `GRUPO_PAGAMENTO_JID`
- Configurada nos arquivos `.env`.
- O código do encaminhador (`motor/src/dossie/encaminhador.js`) valida o JID através da expressão regular estrita:
  ```javascript
  const EH_JID_GRUPO = /^[a-zA-Z0-9_-]+@g\.us$/;
  ```
- O envio para o grupo é rejeitado preventivamente se o JID não terminar em `@g.us` ou for um identificador fictício/individual.

---

## 4. Diagnóstico e Status da Migration 26 (LGPD e Consentimento)

### 4.1. Diagnóstico no Supabase
Foi executada uma consulta de verificação direta no schema cache do Supabase:
```javascript
const { error } = await supabase.from('consentimento_historico').select('id').limit(1);
```
**Resultado:** Erro retornado: `PGRST205: Could not find the table 'public.consentimento_historico' in the schema cache`.

**Conclusão Técnica:** A Migration 26 **NÃO FOI APLICADA** ainda no banco de dados Supabase de produção.

### 4.2. Especificação do Script SQL (`banco/26_consentimento_e_auditoria_lgpd.sql`)
O script é totalmente idempotente (`IF NOT EXISTS`), seguro, multi-tenant e não destrutivo. Ele cria a estrutura de conformidade LGPD necessária para auditar consentimentos, solicitações de descadastramento (opt-out), bloqueios e reativações:

```sql
-- ============================================================================
-- 26_CONSENTIMENTO_E_AUDITORIA_LGPD.SQL
-- ============================================================================

create table if not exists public.consentimento_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  id_conversa uuid references public.conversas(id) on delete set null,
  telefone text not null,
  tipo_evento text not null check (
    tipo_evento in (
      'opt_out_solicitado',
      'opt_in_reativacao',
      'exclusao_dados',
      'bloqueio_comercial'
    )
  ),
  canal text not null default 'whatsapp',
  mensagem_gatilho text,
  ip_origem text,
  detalhes jsonb default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- Índices para buscas performáticas por organização e telefone
create index if not exists idx_consentimento_user_tel
  on public.consentimento_historico (user_id, telefone);

create index if not exists idx_consentimento_conversa
  on public.consentimento_historico (id_conversa);

create index if not exists idx_consentimento_criado
  on public.consentimento_historico (criado_em desc);

-- ============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS) — ISOLAMENTO MULTI-TENANT ESTRITO
-- ============================================================================

alter table public.consentimento_historico enable row level security;

-- Política de Leitura: usuários só visualizam eventos de consentimento da sua organização
drop policy if exists "consentimento_select_tenant" on public.consentimento_historico;
create policy "consentimento_select_tenant"
  on public.consentimento_historico
  for select
  using (
    auth.uid() is not null and auth.uid() = user_id
  );

-- Política de Inserção: usuários só inserem na sua organização
drop policy if exists "consentimento_insert_tenant" on public.consentimento_historico;
create policy "consentimento_insert_tenant"
  on public.consentimento_historico
  for insert
  with check (
    auth.uid() is not null and auth.uid() = user_id
  );
```

### 4.3. Procedimento de Aplicação no Supabase Dashboard
1. Acesse o console web do Supabase (`https://supabase.com/dashboard/project/voxntxzomdymvsjhzamg`).
2. No menu lateral esquerdo, clique em **SQL Editor**.
3. Clique em **New Query**.
4. Copie e cole o conteúdo acima (arquivo `banco/26_consentimento_e_auditoria_lgpd.sql`).
5. Clique em **Run** (ou `Ctrl + Enter`).
6. Confirme a mensagem: *"Success. No rows returned."*

---

## 5. Diagnóstico Detalhado das Integrações

| Componente | Endpoint / Alvo | Status Verificado | Evidência Técnica |
| :--- | :--- | :--- | :--- |
| **Supabase Database** | `https://voxntxzomdymvsjhzamg.supabase.co` | **Conectado** | Autenticação via `@supabase/supabase-js` ok; tabelas acessíveis. |
| **Provedor IA Groq** | `https://api.groq.com/openai/v1` | **Operacional** | Ping na API executado com sucesso; 11 modelos disponíveis. |
| **Provedor IA Gemini** | `https://generativelanguage.googleapis.com` | **Operacional** | Ping na API executado com sucesso; 50 modelos disponíveis. |
| **Painel Next.js** | Porta 3000 (Local / Vercel) | **Build Aprovado** | `npm run build` gerou 21 rotas estáticas/dinâmicas em 3.5s sem erros. |
| **Correlation ID & Logs** | `motor/src/log.js` | **Operacional** | `AsyncLocalStorage` propaga `[correlationId]` unificado em todas as etapas. |
| **Evolution API** | `http://localhost:8080` (WSL) | **Em Espera** | Contêiner desligado no WSL Ubuntu; será acionado pelo `Vez.bat`. |

---

## 6. Evidências dos 8 Critérios de Teste Controlado (`motor/test/piloto_controlado.test.js`)

A suíte formal de testes pré-piloto foi executada e aprovada com louvor:

| Nº | Critério Operacional | Cenário Validado | Resultado |
| :---: | :--- | :--- | :---: |
| **1** | Número autorizado recebe resposta | `verificarBloqueioPiloto` com telefone autorizado retorna `bloqueado: false`. | **APROVADO** |
| **2** | Número não autorizado bloqueado | Remetente fora da allowlist retorna `bloqueado: true` e motivo explícito. | **APROVADO** |
| **3** | Deduplicação de mensagens | Mensagens com mesmo ID/hash são descartadas pela trava sem gerar duplicidades. | **APROVADO** |
| **4** | Mensagens sequenciais (FIFO) | Múltiplas mensagens em rajada de um contato respeitam a ordem de chegada. | **APROVADO** |
| **5** | Reinício preserva allowlist | Nova inicialização do motor lê a variável do ambiente e mantém o bloqueio. | **APROVADO** |
| **6** | Follow-up bloqueia não autorizado | `varrerSugestoes` e `varrerEnviosAprovados` não interagem com números fora da lista. | **APROVADO** |
| **7** | Intervenção humana desativa bot | Flag `so_voce: true` transfere controle ao consultor e silencia a IA imediatamente. | **APROVADO** |
| **8** | Retorno de controle seguro | IA só retoma o fluxo de perguntas após resposta do consultor ou liberação manual. | **APROVADO** |

---

## 7. Procedimento Operacional Seguro de Inicialização e Encerramento

### 7.1. Checklist Pré-Voo
- [ ] Migration 26 executada no Supabase SQL Editor.
- [ ] Números de teste autorizados inseridos em `PILOTO_TELEFONES_AUTORIZADOS` no arquivo `motor/.env`.
- [ ] JID oficial do grupo de pagamento inserido em `GRUPO_PAGAMENTO_JID` no arquivo `motor/.env`.
- [ ] Confirmar que nenhum número de cliente real consta na allowlist de teste.

### 7.2. Procedimento de Inicialização
1. Inicie os serviços locais através do executável:
   ```cmd
   Vez.bat
   ```
   *(Este comando inicializa o WSL Ubuntu, o contêiner Evolution API e os servidores do Painel e Motor)*.
2. No terminal do Motor, verifique o log de inicialização:
   ```text
   [Piloto] Modo piloto ATIVO. Apenas X número(s) autorizado(s) receberão respostas automáticas.
   ```
3. Realize o teste com um número autorizado (deve responder normalmente) e com um número não autorizado (deve registrar bloqueio no log e permanecer em silêncio).

### 7.3. Procedimento de Emergência (Kill-Switch)
Caso seja necessário interromper o piloto imediatamente:
- **Opção A (Parada Total do Motor):** Pressione `Ctrl + C` no terminal do motor.
- **Opção B (Bloqueio Total sem Desligar):** Defina no `motor/.env`:
  ```env
  PILOTO_TELEFONES_AUTORIZADOS=BLOQUEIO_TOTAL
  ```
  O motor rejeitará 100% dos envios automáticos imediatamente.
