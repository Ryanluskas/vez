# Vez

Agente de WhatsApp com IA para consultores de crédito consignado.

O bot atende sozinho: entende a mensagem, lembra do cliente, pergunta só o que falta,
consulta o que precisa e responde no seu tom. Quando a pergunta envolve **valor,
quanto libera, parcela, simulação, margem ou saldo**, ele não chuta — congela aquela
conversa, coloca a pergunta numa **fila em ordem de chegada** e segue atendendo os
outros. Você responde só o número; ele escreve, valida e manda.

## A regra de ouro

**A IA nunca é fonte de verdade para número.** Valor, parcela, juros, margem, saldo e
simulação vêm de você ou do banco de dados — nunca do modelo. Ele decide *como*
responder, jamais *qual* é o dado.

O valor pode vir de dois lugares reais: **você respondendo na Fila**, ou **uma lista que
você subiu**. Nunca do modelo.

Isso não é uma instrução no prompt. São cinco barreiras independentes, e cada uma
assume que a anterior falhou:

| # | Onde | O que faz |
| --- | --- | --- |
| 1 | `gatilhos.js` | Regex sobre a mensagem do cliente. Achou cheiro de dinheiro, vai pra Fila e a IA **nem é chamada** |
| 2 | `ferramentas.js` | Argumento de ferramenta com número de dinheiro é recusado — o dado nem entra na memória |
| 3 | `numeros.js` | Os exemplos de estilo entram mascarados: o modelo não tem dígito pra copiar |
| 4 | `validar.js` | Todo número do rascunho tem que estar na sua resposta, na pergunta do cliente ou no manual |
| 5 | `decidir.js` | A categoria `valor` nunca sai sozinha, em modo nenhum |

Se não houver fonte real para o dado, o agente **pergunta ao cliente ou chama você**.
Nunca preenche a lacuna.

## As duas peças

| Peça | Onde roda | O que faz |
| --- | --- | --- |
| **Painel** (`painel/`) | Vercel, acessível de qualquer lugar | Fila, rascunhos, conversas, atividade do agente, modo |
| **Motor** (`motor/`) | No PC do consultor | WhatsApp Web + Ollama, sincroniza com o Supabase |

O login amarra as duas. Cada conta só enxerga os próprios dados (Row-Level Security no
Postgres). O motor roda local de propósito: é isso que mantém as mensagens dos clientes
dentro do computador do consultor.

## Estado atual

Concluído e funcionando:

- [x] **Painel** — cadastro/login, RLS, identidade visual, fila, rascunhos, conversas
- [x] **Motor** — WhatsApp Web multi-número, QR no painel, importação de histórico
- [x] **Regra de ouro** — 5 barreiras, cobertas por teste
- [x] **Memória por cliente** — nome, convênio, banco, objetivo, documentos entregues
- [x] **Perguntas mínimas** — pede só o que falta, no máximo 2 por mensagem
- [x] **Orquestrador** — decisão determinística, função pura, testável sem IA
- [x] **Ferramentas** — 11 ações validadas, com limite, dedup, timeout e registro
- [x] **Handoff com continuação** — você responde uma vez, o agente segue sozinho
- [x] **Validator** — 10 checagens antes de qualquer mensagem sair
- [x] **Recuperação** — retry com backoff e disjuntor por dependência
- [x] **Observabilidade** — diário do agente, métricas e batimento do motor
- [x] **Concorrência** — trava por conversa, dedup de evento, teste com vários clientes
- [x] **Modo autônomo** — manual / assistido / autônomo
- [x] **Listas de clientes** — planilha com os valores reais, campos que o bot pode
      falar, e porcentagem da redução

Não existe ainda:

- [ ] **Integração ao vivo com o sistema do banco** — a lista resolve o caso do cliente
      que está na planilha; para quem não está, a pergunta continua indo pra Fila
- [ ] **Instalador Windows** do motor

## Como iniciar

Dê dois cliques no atalho **Vez** na Área de Trabalho. Ele compila o painel se precisar,
sobe painel e motor, e abre o navegador. A janela preta é o motor: é nela que aparece o
QR e o log. Fechar a janela para tudo.

Se o atalho sumir, recrie com `ferramentas\criar-atalho.bat`.

### Na mão

```bash
npm install --prefix painel && npm install --prefix motor
```

```bash
npm run dev --prefix painel
```

```bash
npm start --prefix motor
```

Antes de reclamar de qualquer coisa, rode o diagnóstico — ele confere .env, Ollama,
login, tabelas, colunas e a regra de ouro, e diz exatamente o que fazer:

```bash
npm run diagnostico --prefix motor
```

## Variáveis de ambiente

**`painel/.env.local`** (copie de `.env.local.example`):

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | Chave `sb_publishable_...` |

**`motor/.env`** (copie de `.env.example`):

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `SUPABASE_URL` | sim | A mesma do painel |
| `SUPABASE_PUBLISHABLE_KEY` | sim | A mesma do painel |
| `VEZ_EMAIL` / `VEZ_SENHA` | sim | Sua conta no painel |
| `OLLAMA_MODELO` | não | Padrão `llama3.2:3b` |
| `OLLAMA_URL` | não | Padrão `http://localhost:11434` |
| `GROQ_API_KEY` | não | Liga o modelo grande para redigir. Sem ela o local escreve, mais devagar |
| `GROQ_TIMEOUT_MS` | não | Padrão `8000`. Medido: ~500ms por mensagem |
| `OLLAMA_TIMEOUT_PENSAR_MS` | não | Padrão `12000`. Classificar/extrair com modelo quente leva 4–6s |
| `OLLAMA_TIMEOUT_ESCREVER_MS` | não | Padrão `35000` |
| `VEZ_PENSAR_NA_NUVEM` | não | `1` deixa o Groq classificar quando o local falha. Desligado: essas chamadas veem a mensagem crua do cliente |
| `GROQ_MODELO` | não | Padrão `llama-3.3-70b-versatile` |
| `VEZ_PLANEJADOR` | não | `0` desliga o planejador (uma chamada de IA a menos por resposta) |
| `WA_VERSAO_HTML` | não | Prende o WhatsApp Web numa versão conhecida |

A chave `sb_secret_...` **nunca** entra em lugar nenhum: ela ignora o RLS, e é o RLS que
separa um consultor do outro. O motor recusa iniciar se encontrar uma.

## Migrations

No *SQL Editor* do Supabase, cole `banco/tudo.sql` — é todos juntos e pode ser rodado
de novo sem quebrar nada. Separados, nesta ordem:

| Arquivo | O que traz |
| --- | --- |
| `01_tabelas.sql` `02_rls.sql` | Tabelas e isolamento por conta |
| `03_conexoes.sql` | Vários números de WhatsApp |
| `04_fase3.sql` `05_atender.sql` | Rascunhos, categorias, silenciar contato |
| `06_funil.sql` | Etapas de venda e follow-up |
| `07`–`10` | Multi-número, importação, migração @lid |
| `11_atalhos.sql` `12_conhecimento.sql` | Respostas curinga e manual da operação |
| `13_autonomo.sql` `15_modos.sql` | Modo manual / assistido / autônomo |
| `14_memoria.sql` | Memória por cliente |
| `16_handoff.sql` | Origem do rascunho, contador de escalonamentos, trava de loop |
| `17_ferramentas.sql` | Registro das ferramentas executadas |
| `18_observabilidade.sql` | Diário do agente, batimento do motor, métricas |
| `19_listas.sql` | Listas de clientes, campos liberados, porcentagem |
| `20_estado_comercial.sql` | Etapa da negociação, origem, simulação já passada |

O `02` é o que isola os dados de cada consultor: a consulta no fim dele tem que mostrar
`rls_ligado = true` e 4 políticas por tabela.

## Os três modos

Em **Conta → Modo do agente**:

| Modo | O que sai sozinho |
| --- | --- |
| **Manual** | Nada. Tudo espera aprovação em Rascunhos |
| **Assistido** | Só decisão de alta confiança (≥ 0.8) nas categorias que você liberou |
| **Autônomo** | Tudo nas categorias liberadas |

"Confiança" aqui **não** é o modelo se auto-avaliando — isso seria número decorativo. É
quão determinística foi a decisão: `1.0` quando saiu de regra rígida, `0.8` do
classificador, `0.5` quando ele não soube encaixar. O modo assistido corta em `0.8`,
então deixa passar o que o código decidiu e segura o que dependeu de palpite.

Em **modo nenhum** a categoria `valor` sai sozinha.

O follow-up é a exceção histórica: sai sem aprovação em qualquer modo, porque um
lembrete que espera aprovação vira mais uma tarefa na pilha — ou seja, não acontece. O
que protege isso é o texto ser fixo, escrito à mão, sem número e sem IA no meio.

## Quem pensa e quem escreve

| Papel | Modelo | Por quê |
| --- | --- | --- |
| **Decidir o óbvio** — saudação, prazo, convênio, banco, documento | **Código** (`extrair.js`, `classificar.js`) | Não é interpretação de linguagem, é reconhecimento de palavra. Microssegundos, e não erra |
| **Pensar** — o que a regra não resolveu | Ollama local | Vê a mensagem crua, inclusive quando fala de dinheiro. Não sai da máquina |
| **Escrever** — a mensagem que o cliente lê | Groq, se houver chave; senão o local | Em modo autônomo isso sai sem ninguém ler antes; qualidade importa |

Trocáveis por variável de ambiente, sem tocar na lógica. Sem `GROQ_API_KEY` tudo
continua funcionando, só sai mais duro.

**Decidir não é dos dois.** A decisão é código (`agente/decidir.js`), função pura,
testada. O brief original pedia um agente devolvendo `{action, confidence}` em JSON —
mas medindo o `llama3.2:3b` nessa tarefa, ele mistura `R$` com `%`, copia número de
exemplo e responde "Não sei" pro cliente. Construir a parte mais crítica do produto
sobre a parte menos confiável dele seria um erro caro.

## Uma conversa, não mensagens soltas

O agente carrega o **estado comercial** da conversa, não só fatos avulsos do
cliente. Isso nasceu de uma conversa real que deu errado:

```
BOT:     Oi Ademar, aqui é o Ryan. Vi que seu contrato Santander tem margem
         pra reduzir a taxa e liberar um valor pra você…
CLIENTE: Preciso saber se ainda libera pra mim
BOT:     Você é aposentado do INSS ou servidor? Em qual banco está seu empréstimo?
```

O bot perguntou o banco que **ele mesmo** tinha citado, duas mensagens antes.
Do lado do cliente isso não é "faltou um dado" — é não ter ninguém prestando
atenção. Três causas, e as três estão corrigidas:

**1. Ele não aprendia com as próprias mensagens.** A abordagem carrega nome e
banco, e isso se perdia. Agora `abordagem.js` lê a mensagem de saída e grava o
que ela já dizia. (Cuidado que custou um teste: em "aqui é o Ryan", o nome é do
**consultor** — a mesma frase vinda do cliente significa o contrário.)

**2. Ele não entendia ponteiro pra trás.** "Aquele valor", "você já me disse",
"já mandei" viravam perguntas novas. `referencias.js` resolve isso — e quem
responde "eu já sei isso?" é o **estado**, nunca o modelo. Modelo perguntado se
já sabe algo responde o que soar plausível.

**3. Ele não sabia em que etapa estava.** Pedir contracheque logo depois de
dizer "já analisei seu caso" faz o cliente concluir, com razão, que ninguém
olhou nada. Em prospecção o próximo passo é a **simulação**, que é sua; papel
vem depois.

### O estado

| Campo | O que guarda |
| --- | --- |
| `origem` | `prospeccao` (você abordou) ou `entrada` (ele chegou) |
| `etapa_comercial` | prospecção → interesse → simulação → documentos → fechamento |
| `simulacao` | `{valor, parcela, taxa, de, em}` — **só de consultor ou lista** |
| `aguardando` | o que o bot espera dele agora |
| `nome`, `convenio`, `banco`, `objetivo`, `coletado` | o que já se sabe |

**`simulacao` é a única exceção a "memória não guarda valor"**, e ela tem regra
dura: `de` só aceita `consultor` ou `lista`. O modelo não escreve ali, em
caminho nenhum. Guardar o que **você** disse não é deixar a IA inventar — é o
contrário: é o que permite recusar tudo que não seja isso.

### A abordagem

```
Oi {NOME}, aqui é o Ryan. Vi que seu contrato {BANCO} tem margem pra reduzir
a taxa de juros e liberar um valor pra você, sem aumentar nada na folha.
Posso te mandar a simulação?
```

Não é sugestão de tom: é a abordagem comercial. Mudar o sentido dela muda o que
o cliente está respondendo quando diz "sim".

## Quando a IA falha

O cliente nunca fica no silêncio. Toda falha de geração — Ollama fora, Groq fora,
tempo estourado, texto recusado pelo validator — cai numa das duas saídas:

```
IA falha
   ↓
existe resposta determinística?  →  sim  →  responde
   ↓                                         (saudação, confirmação de informação,
  não                                         documento recebido, pedido do que falta)
   ↓
avisa o cliente que vai verificar  +  manda pra Fila
```

O aviso não responde a pergunta: diz que a mensagem chegou e que alguém vai olhar —
que é o que é verdade. Nenhuma resposta determinística tem dígito; `respostas.js`
confere isso na saída, além de todas terem sido escritas à mão.

**Nunca inventa pra evitar o handoff.** Sem fonte real, o caso é seu.

O caminho de escrita tenta, nesta ordem: **Groq** (8s) → **Ollama local** (35s) →
**resposta determinística** → **aviso + Fila**. Classificar e extrair tentam a
**regra primeiro** e só chamam o modelo local (12s) pelo que sobrou.

## As ferramentas

O modelo **escolhe** qual usar; ele nunca escreve a chamada. O que sai dele é
`{"nome": ..., "argumentos": {...}}`, e só vira execução depois de bater com uma
definição do registro e passar na validação.

| Ferramenta | Escreve? | Estado |
| --- | --- | --- |
| `consultar_cliente` | não | funcional |
| `consultar_memoria` | não | funcional |
| `consultar_pendencias` | não | funcional |
| `buscar_conhecimento` | não | funcional |
| `atualizar_memoria` | sim | funcional |
| `marcar_informacao_coletada` | sim | funcional |
| `atualizar_etapa` | sim | funcional (recusa `fechado`/`perdido` — o bot não vê o resultado da proposta) |
| `registrar_documento_recebido` | sim | funcional |
| `criar_followup` | sim | funcional (liga a cobrança; **quando** sai é do funil) |
| `cancelar_followup` | sim | funcional |
| `solicitar_intervencao` | sim | funcional |
| `consultar_simulacao` | não | funcional **quando o cliente está numa lista ativa**; senão responde `{disponivel: false}` |

O modelo só pode escolher as de **leitura**. Escrever é decidir, e decidir continua no
orquestrador. O `id_conversa` é preenchido pelo código, nunca pelo modelo: uma
alucinação de id leria os dados de outro cliente.

Cinco proteções no executor: limite de 6 por ciclo, chamada repetida devolve o primeiro
resultado sem re-executar, corte de 8 segundos, erro vira resposta em vez de exceção, e
tudo fica registrado.

## Listas de clientes

Em **Listas** você sobe a planilha e o bot passa a ter os valores daqueles clientes. É a
única fonte de valor que existe além de você.

**Como acha o cliente:** pelo telefone do WhatsApp. A planilha precisa das colunas `DDD` e
`Celular`. O motor procura pelo número inteiro (`55` + DDD + celular) e também pelos
últimos 8 dígitos — o WhatsApp varia no nono dígito e no `55`, e casar só pelo número
inteiro perderia cliente de verdade.

**O que o bot pode falar:** nada, até você ligar. Os campos começam todos desligados —
subir uma planilha não pode, sozinho, fazer o bot sair dizendo o saldo devedor de
ninguém. Campo desligado não é escondido da mensagem: ele nem sai da consulta, então o
redator não tem como vazá-lo.

| Campo | Vem de |
| --- | --- |
| Redução total | `Reducao_Total` — **a porcentagem incide aqui** |
| Margem livre | `Margem_Livre` |
| Saldo devedor | `Saldo_Devedor_Total` |
| Soma das parcelas | `Soma_Parcelas` |
| Total de parcelas | `Total_Parcelas` |
| Contratos | `Contrato_N`, `Taxa_N`, `Valor_Parcela_N`, `Parcelas_Pagas_N` |

**A porcentagem:** você põe 66, e de uma redução de `R$ 3.174,54` o cliente ouve
`R$ 2.095,20`. É multiplicação, e vale **só na redução total** — os outros campos saem
como estão na planilha.

A conta é feita no motor, antes de qualquer prompt. O modelo recebe o número já reduzido e
não sabe que existiu outro. E o valor cheio não sobrevive em lugar nenhum: se o modelo
escrever `3.174,54`, esse número não está em fonte nenhuma e o validator recusa.

**Mensagem com valor da lista sempre espera sua aprovação**, mesmo em modo autônomo. O
dado é real, mas ninguém conferiu se é o dado *daquela* pessoa — a planilha casa por
telefone, e um telefone trocado numa linha vira o saldo de um cliente indo pro outro. Uma
aprovação antes do primeiro número sair custa segundos; o contrário custa um cliente.

**O bot não depende da lista.** Cliente fora dela, lista desligada, ou nenhum campo
liberado: a pergunta vai pra Fila, exatamente como antes. A lista é atalho, nunca
dependência.

## O validator

Nenhuma mensagem chega ao cliente sem passar por `validarAntesDeEnviar`. Ele bloqueia:

| Código | O que pega |
| --- | --- |
| `inventou_numero` | Valor, parcela ou juros que não veio de fonte real |
| `numero_de_exemplo` | Número copiado de um exemplo de estilo — é valor de outro cliente |
| `outro_cliente` | Nome de gente que não é este cliente |
| `contradiz_manual` | Afirma o que o seu manual nega |
| `repergunta` | Pergunta de novo o que o cliente já disse |
| `e_do_consultor` | Promessa financeira, mesmo sem cifra ("sua parcela vai ficar tranquila") |
| `malformado` | JSON, bloco de código, "como uma IA", pedaço do prompt, caractere em looping |
| `injecao` | O cliente tentou mudar as regras do bot |
| `nao_sei` / `marcador` / `vazio` / `curto` | Texto que não é resposta |

Reprovar **nunca** significa "manda mesmo assim". Significa: não envia, grava o motivo,
e chama você quando o motivo for do tipo que só gente resolve. Malformado e repergunta
o bot causou sozinho e resolve sozinho na próxima; valor inventado e dado de outro
cliente, não.

Nada aqui pergunta pra IA se a resposta da IA está boa. Modelo avaliando o próprio texto
erra junto.

## Recuperação

| Falha | O que acontece |
| --- | --- |
| Rede piscando, Supabase hibernando, 429/503 | Retenta com espera crescente (400ms → 1.2s → 3.6s) |
| Erro de programação, 401, 404 | Não retenta: repetir bug só gasta o tempo do cliente |
| Ollama, Groq ou Supabase caindo repetido | Disjuntor abre depois de 4 falhas e para de tentar por 60s |
| WhatsApp não abre | 3 tentativas, depois apaga a sessão e pede QR; 5 min de descanso |
| Chrome travado | Sessão limpa no próximo boot, varredura de processos órfãos |
| Ferramenta de escrita falhando | **Não** retenta — pode ter gravado antes do erro |

Nunca fica reiniciando infinito, e **nunca inventa resposta**: falha esgotada vira
pendência pro consultor. Com o disjuntor aberto a chamada nem sai, então o cliente vai
pra Fila na hora em vez de esperar meio minuto por uma resposta que não vem.

## Observabilidade

Em **Atividade** você vê a linha do tempo do agente:

```
21:03 — Cliente enviou mensagem     · Josenete
21:03 — Agente identificou a intenção · valor · precisa de você (regra rígida)
21:03 — Memória atualizada          · aprendi banco
21:03 — Ferramenta executada        · solicitar_intervencao
21:03 — Passou para você            · valor
```

Justificativa operacional curta, nunca raciocínio do modelo — chain-of-thought não ajuda
a decidir nada e ainda dá a impressão de que a decisão foi do modelo.

Métricas do dia: mensagens recebidas, respostas automáticas, intervenções humanas,
**taxa de automação**, erros, respostas barradas, tempo médio de resposta, ferramentas
usadas e por que o bot te chamou.

O diário **nunca guarda** valor, token, chave ou URL com credencial — há uma peneira, e
há teste dela.

**Status do motor** no topo da mesma tela: ligado, reconectando, erro ou offline. O
motor grava um batimento a cada 30s; "offline" é a ausência dele. Motor que caiu não
consegue avisar que caiu.

## Concorrência

O motor atende vários clientes ao mesmo tempo. Um cliente esperando você **não** bloqueia
os outros — a trava é **por conversa**, não global:

- Cliente ansioso mandando 3 mensagens em 3 segundos → 3 turnos em ordem, 1 resposta
- Cliente A travado com você → clientes B, C, D seguem normalmente
- Evento reentregue pelo WhatsApp → ignorado antes de qualquer consulta
- Mesma ferramenta com os mesmos argumentos no mesmo ciclo → executa uma vez
- Tarefa que estoura → libera a fila daquela conversa em vez de travá-la pra sempre

Três defesas para três problemas diferentes: trava de arquivo (dois motores), índice
único em `mensagens.id_whatsapp` (mesma mensagem) e a trava por conversa (mesma conversa).

## O fluxo completo

**Quando o bot dá conta:**

```
cliente → WhatsApp → motor → contexto + memória → orquestrador → decisão
   → ferramenta (se precisar) → redação → VALIDATOR → cliente
```

**Quando falta informação do cliente:**

```
agente → pergunta só o que falta → cliente responde
   → memória atualiza → agente continua
```

**Quando falta informação sua:**

```
agente → handoff (com o dossiê pronto) → você responde só o dado
   → agente interpreta → VALIDATOR → cliente recebe → agente continua sozinho
```

O rascunho nascido da **sua** resposta sai sem segunda aprovação: você já aprovou quando
respondeu na Fila. O que segura a segurança ali não é a aprovação, é a conferência de
procedência — todo número tem que estar na sua resposta, senão sai o seu texto cru.

**Freio de loop:** conversa que volta 3× pra sua mão sem sair do lugar passa a ser sua.
O bot só grava ali até você devolver em Conversas. Ele nunca solta sozinho.

## Memória e perguntas mínimas

O bot lembra de cada cliente: nome, convênio, banco, objetivo e quais documentos já
chegaram. Uma linha por conversa, em `memoria`. **Nunca guarda valor, parcela ou taxa** —
isso muda a cada simulação e só você sabe.

O que falta é calculado em `requisitos.js` — código, não IA. Regra de negócio não é
interpretação, e assim a lógica sobrevive a troca de modelo.

| cliente pergunta | falta documento? | o bot |
| --- | --- | --- |
| "quanto libera?" | sim | **pede o documento ao cliente** |
| "quanto libera?" | não | chama você, com o dossiê pronto |

"Quanto libera?" sem contracheque na mão não é pergunta pra você — é pergunta que
ninguém pode responder ainda. Isso não fura a regra de ouro: o que sai é uma pergunta,
sem número nenhum.

No máximo **dois pedidos por mensagem**, e ele desiste do que já pediu duas vezes.

## O que o bot sabe, e o que ele copia

Duas coisas diferentes, nas duas metades de **Meu jeito**:

- **Meu jeito** (`respostas_boas`) — exemplos de **como** você fala. Alimenta o few-shot
- **O que o bot sabe** (`conhecimento`) — fatos sobre **o que é verdade** na sua operação

O conhecimento **recusa valor, taxa e parcela** ao salvar. CNPJ e endereço passam: são
fatos da empresa, não do contrato de ninguém — é o que permite responder *"isso não é
golpe?"*.

## O funil

Cada conversa tem duas coisas que não se misturam:

- **estágio** — onde a *mensagem* está: bot atendendo, travada com você, rascunho pronto
- **etapa** — onde o *cliente* está na venda: novo → conversando → esperando documentos
  → documentos recebidos → em análise → fechado ou perdido

**Quando o cliente manda arquivo**, o motor não classifica — reconhece como documentação,
confirma na memória o que foi pedido por último, move a etapa e te avisa no seu próprio
WhatsApp. Você vive no WhatsApp, não no painel.

**Quando o cliente some**, o bot cobra sozinho:

| tentativa | conversando | esperando documentos |
| --- | --- | --- |
| 1ª | 4 horas | 6 horas |
| 2ª | 1 dia | 1 dia |
| 3ª | 3 dias | 3 dias |

Depois da terceira ele para e marca como perdida. Nunca antes das 8h nem depois das 20h,
nunca em conversa silenciada, e **nunca em quem está esperando você**.

## Testes

```bash
npm test --prefix motor
```

291 testes, sem rede e sem IA — rodam em segundos.

Além deles há verificação de ponta a ponta contra o Supabase e o Ollama reais:

```bash
npm run e2e --prefix motor
```

`e2e:ademar` roda a conversa comercial inteira, `e2e:banco` confere as migrations,
`e2e:queda` derruba a IA de verdade e `e2e:lista`
importa uma planilha e confere a conta da porcentagem. Todos limpam o que criam.

| Arquivo | Cobre |
| --- | --- |
| `gatilhos.test.js` | A regra de ouro, 40 frases reais |
| `numeros.test.js` | Detector de número inventado, formatos, taxa |
| `decidir.test.js` | Cada caminho do orquestrador |
| `requisitos.test.js` | O que falta, quantas vezes pedir, quando desistir |
| `funil.test.js` | Follow-up: quando cobrar e quando calar |
| `handoff.test.js` | Handoff, resposta curta, retomada, freio de loop |
| `ferramentas.test.js` | Argumento inválido, ferramenta inexistente, timeout, erro, repetição |
| `planejar.test.js` | A peneira do plano do modelo |
| `validador.test.js` | As 10 checagens, injeção, dado de outro cliente |
| `concorrencia.test.js` | Vários clientes, mensagens simultâneas, duplicadas |
| `recuperacao.test.js` | Ollama/Groq/Supabase/WhatsApp fora, retry, disjuntor, peneira de segredo |
| `agente.test.js` | Os três caminhos do fluxo, ponta a ponta |
| `extrair.test.js` | As nove frases que o modelo errava, e o óbvio decidido por código |
| `fallback.test.js` | IA caída nos seis estados, resposta sem IA, e o cliente nunca no silêncio |
| `conversa-comercial.test.js` | Estado, referências, não repetir pergunta — e a conversa do Ademar inteira |
| `lista.test.js` | Porcentagem, campos liberados, telefone, e o valor cheio sendo recusado |
| `redator.test.js` | O atalho que evita gerar texto que seria descartado |

## Publicar na Vercel

- **Root Directory:** `painel`
- **Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Deployment Protection → Vercel Authentication:** desligado, senão só o dono da conta
  Vercel consegue abrir o painel

As duas variáveis são `NEXT_PUBLIC_`, gravadas no bundle na hora do build. Mudou o valor,
precisa **redeploy** — não basta salvar.

O `motor/` fica de fora do deploy: ele só existe na máquina do consultor.

## Estrutura

```
banco/            SQL: tabelas, RLS, migrations 01–18
painel/           Next.js 16 + TypeScript + Tailwind v4
  app/(painel)/   fila, rascunhos, conversas, atividade, meu-jeito, listas, conexão, conta
  components/     marca, ui, fila, painel, conta, conversas, rascunhos, conexão
  lib/            clientes do Supabase, ações de servidor, tipos, leituras
  proxy.ts        sessão e rotas protegidas (era middleware.ts até o Next 15)
motor/
  src/
    index.js        liga tudo, desliga limpo, pega erro solto
    ambiente.js     lê e confere o .env
    supabase.js     login na conta, com sessão guardada
    whatsapp.js     cliente do WhatsApp, QR, eventos, dedup
    conexoes.js     o maestro: um cliente por número, com reconexão
    gatilhos.js     A REGRA DE OURO — o que nunca chega na IA
    classificar.js  regra rígida + Ollama, nessa ordem
    numeros.js      máscara dos exemplos e conferência de procedência
    memoria.js      o que o bot lembra de cada cliente
    lista.js        a planilha do consultor: campos liberados e porcentagem
    extrair.js      convênio, banco, nome e objetivo por regra — sem modelo
    respostas.js    o que dá pra responder sem IA nenhuma
    referencias.js  "aquele valor", "você já me disse" — o estado responde
    abordagem.js    a abordagem do Ryan, e o que ela já ensina
    requisitos.js   o que falta pra simular ou fechar — código puro
    redator.js      escreve no seu tom (few-shot)
    fluxo.js        o orquestrador: retrato → decisão → execução
    escuta.js       ouve o painel: respostas da fila e rascunhos aprovados
    funil.js        etapas e follow-up
    seguimento.js   o cobrador
    ia.js           quem pensa e quem escreve, com disjuntor
    resiliencia.js  retry com backoff e disjuntor por dependência
    travas.js       uma conversa por vez, todas ao mesmo tempo
    observar.js     o diário do agente, com peneira de segredo
    batimento.js    o motor diz ao painel que está vivo
    diagnostico.js  confere tudo e diz o que fazer
    agente/
      decidir.js      a decisão — função pura, sem I/O
      validar.js      o porteiro — 10 checagens antes de enviar
      ferramentas.js  o registro: 11 ações com contrato
      executor.js     limite, dedup, timeout, erro, registro
      planejar.js     o modelo escolhe o que consultar (só leitura)
  test/             291 testes
  src/e2e/          verificação contra o sistema real
  sessao/           credenciais do pareamento — gitignorado
```

## Identidade

Base preto-tinta quente (`#14110E`), neutros quentes, texto papel. Uma cor de destaque:
jade `#1FA173`, usada só no item ativo do menu, na ação primária e no sinal do motor.
Brasa `#E08A3C` é semântico — só aparece para dizer que um cliente está esperando demais.
Bricolage Grotesque no wordmark e nos títulos, Geist na interface, Geist Mono em todo
número. Escuro por padrão, claro em **Conta → Tema**.
