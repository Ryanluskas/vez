# Vez

Atendente de WhatsApp com IA para consultores de crédito.

O bot responde as dúvidas simples imitando o jeito de falar do consultor. Quando a
pergunta envolve **valor, quanto libera, parcela, simulação ou saldo**, ele não chuta:
congela aquela conversa, coloca a pergunta numa **fila em ordem de chegada** e segue
atendendo os outros clientes. O consultor responde no painel e a conversa volta a fluir.

**Nada é enviado sozinho — com uma exceção.** Toda resposta a cliente passa pela sua
aprovação em Rascunhos. A única mensagem que sai sem passar por você é o **follow-up**:
o lembrete que o bot manda pra quem sumiu ("conseguiu separar os documentos?").

Essa exceção é deliberada. Follow-up não tem número, o texto é fixo e escrito à mão —
não passa pela IA — e um lembrete que espera aprovação vira mais uma tarefa na pilha,
ou seja, não acontece. Dá pra desligar por conversa em Conversas.

## As duas peças

| Peça | Onde roda | O que faz |
| --- | --- | --- |
| **Painel** (`painel/`) | Vercel, acessível de qualquer lugar | Login, fila, rascunhos, conversas, exemplos de estilo |
| **Motor** (`motor/`) | No PC do consultor | WhatsApp Web + Ollama, sincroniza com a conta no Supabase |

O login amarra as duas: o consultor entra no painel e configura o mesmo usuário no
motor. Cada conta só enxerga os próprios dados (Row-Level Security no Postgres).

O motor roda local de propósito. O WhatsApp Web e o Ollama exigem uma máquina ligada,
e é isso que mantém as mensagens dos clientes dentro do computador do consultor, sem
API de IA paga.

## Estado atual

- [x] **Fase 1** — painel, cadastro/login, RLS, identidade visual
- [x] **Fase 2** — motor local, WhatsApp, QR na tela Conexão, mensagens no banco
- [x] **Fase 3** — classificação com Ollama, regra rígida de valor, fila viva
- [x] **Fase 4** — rascunhos, aprovar/editar e enviar
- [x] **Fase 5** — aprender o jeito de falar (few-shot)
- [ ] **Fase 6** — polimento
- [ ] **Fase 7** — empacotar o motor num instalador Windows

## Usar no dia a dia

Dê dois cliques no atalho **Vez** na Área de Trabalho. Ele compila o painel se
precisar, sobe painel e motor, e abre o navegador. A janela preta que fica aberta é o
motor: é nela que aparece o QR e o log de quem está sendo atendido. Fechar a janela
para tudo.

Se o atalho sumir, recrie com `ferramentas\criar-atalho.bat`.

Rodando pelo atalho o painel roda **compilado**, não em modo desenvolvimento — sobe em
menos de um segundo em vez de vários. Depois de mexer no código do painel, apague
`painel\.next` para ele recompilar no próximo uso.

## Rodar o painel na mão

**1. Criar o projeto no Supabase.** Em [supabase.com](https://supabase.com), plano
gratuito. Em *Project Settings → API Keys*, copie a **Project URL** e a chave
**publishable** (`sb_publishable_...`).

**2. Colar as chaves.** Copie `painel/.env.local.example` para `painel/.env.local` e
preencha. A chave `sb_secret_...` **nunca** entra aqui: ela ignora o RLS, e é o RLS
que separa um consultor do outro.

**3. Criar as tabelas.** No *SQL Editor* do Supabase, rode nesta ordem:

Ou cole o `banco/tudo.sql`, que é os quatro juntos e pode ser rodado de novo sem
quebrar nada. Separados, na ordem:

- `banco/01_tabelas.sql`
- `banco/02_rls.sql`
- `banco/03_conexoes.sql`
- `banco/04_fase3.sql`
- `banco/05_atender.sql`
- `banco/06_funil.sql`

O `02` é o que isola os dados de cada consultor. A consulta no fim dele confere: as
cinco tabelas têm que aparecer com `rls_ligado = true` e 4 políticas cada.

**4. Subir o painel.**

```bash
npm install --prefix painel
```

```bash
npm run dev --prefix painel
```

Abra `http://localhost:3000`, crie uma conta e você cai na Fila.

> Se o Supabase estiver com confirmação de e-mail ligada (padrão), você recebe um link
> antes de conseguir entrar. Para testar sem isso: *Authentication → Sign In / Up →
> desmarque "Confirm email"*.

## Rodar o motor

O motor é o que conecta seu WhatsApp. Sem ele, o painel fica vazio.

**1. Preencher o `motor/.env`** (copie de `motor/.env.example`): as mesmas duas chaves
do Supabase, mais o e-mail e a senha da sua conta no painel. O login acontece uma vez;
depois a sessão fica guardada em `motor/sessao/`.

**2. Instalar e rodar:**

```bash
npm install --prefix motor
```

```bash
npm start --prefix motor
```

Na primeira vez ele baixa o Chrome que o WhatsApp Web precisa (~200 MB) e demora um
pouco. Quando o QR ficar pronto, abra **Conexão** no painel — ele aparece lá sozinho.
No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.

Depois de pareado, toda mensagem que chegar cai em **Conversas**. O motor precisa
ficar aberto enquanto você quiser ser atendido; fechar a janela apaga a luz no painel.

## Ligar a IA

O motor roda sem IA — mas aí **tudo** vira pendência e você atende na mão. Para o bot
começar a trabalhar:

1. Instale o [Ollama](https://ollama.com/download)
2. `ollama pull llama3.2:3b` (~2 GB, uma vez só)

Depois disso é offline e sem mensalidade. O motor confere no boot e avisa se a IA não
estiver de pé — ele nunca finge que está pensando.

Dá para trocar o modelo por variável: `OLLAMA_MODELO=qwen2.5:3b npm start --prefix motor`.

## Como o bot decide

Chegou mensagem de cliente:

1. **Regra rígida primeiro.** `motor/src/gatilhos.js` procura qualquer sinal de
   dinheiro — valor, parcela, saldo, margem, juros, simulação, número em reais. Se
   achar, vai direto para a Fila e a IA **nem é chamada**.
2. **Depois a IA classifica.** Devolve categoria e se precisa de você. Só um `false`
   explícito libera o bot; qualquer resposta estranha, timeout ou Ollama fora do ar
   cai na Fila.
3. **Se o bot pode responder**, ele escreve imitando seu jeito (few-shot com as
   respostas que você já aprovou, da mesma categoria) e deixa em Rascunhos.
4. **Se ele não souber escrever sem chutar**, vai para a Fila mesmo assim.
5. **Última barreira:** antes de virar rascunho, o texto gerado passa de novo pelos
   gatilhos. Se a IA alucinou um "R$ 5.000", o rascunho é jogado fora e a conversa vai
   para a Fila.

A regra rígida só sabe **forçar** "precisa do consultor". Não existe caminho no código
em que a IA desligue essa trava. Há teste para isso:

```bash
npm test --prefix motor
```

## O funil

Cada conversa tem duas coisas que não se misturam:

- **estágio** — onde a *mensagem* está: bot atendendo, travada com você, rascunho pronto
- **etapa** — onde o *cliente* está na venda: novo → conversando → esperando documentos
  → documentos recebidos → em análise → fechado ou perdido

Um cliente pode estar "esperando documentos" e "travado com você" ao mesmo tempo,
porque perguntou o valor enquanto separava os papéis.

**Quando o cliente manda arquivo** (foto ou PDF), o motor não classifica — reconhece
como documentação, move a etapa e te manda uma mensagem no seu próprio WhatsApp:
`📄 Josenete mandou documento.` Você vive no WhatsApp, não no painel.

**Quando o cliente some**, o bot cobra sozinho:

| tentativa | conversando | esperando documentos |
| --- | --- | --- |
| 1ª | 4 horas | 6 horas |
| 2ª | 1 dia | 1 dia |
| 3ª | 3 dias | 3 dias |

Depois da terceira ele para e marca a conversa como perdida. A terceira mensagem já
se despede em vez de insistir — quem não respondeu três vezes quer ser deixado em paz
com a porta aberta.

Nunca antes das 8h nem depois das 20h, nunca em conversa silenciada, e **nunca em
quem está esperando você responder** — cobrar alguém que aguarda um número seu é o
pior tipo de follow-up que existe.

## O que o bot sabe, e o que ele copia

São duas coisas diferentes, e ficam nas duas metades da tela **Meu jeito**:

- **Meu jeito** (`respostas_boas`) — exemplos de **como** você fala. Alimenta o
  few-shot: o bot lê 2 ou 3 da mesma categoria antes de escrever.
- **O que o bot sabe** (`conhecimento`) — fatos sobre **o que é verdade** na sua
  operação: que empresa é, com que bancos trabalha, como funciona a redução de taxa,
  que documentos pedir. Entra como contexto fixo em todo prompt.

O conhecimento **recusa valor, taxa e parcela** na hora de salvar. Esses números
mudam por cliente; se ficassem no contexto fixo, o bot passaria a dizê-los para todo
mundo — furando a regra de ouro por uma porta lateral.

CNPJ e endereço passam: são fatos da empresa, não do contrato de ninguém. É o que
permite ao bot responder *"isso não é golpe?"*, que é das objeções mais comuns.

## Memória e perguntas mínimas

O bot lembra de cada cliente: nome, convênio, banco, objetivo e quais documentos já
chegaram. Guardado em `memoria`, uma linha por conversa.

**Ele nunca pergunta duas vezes a mesma coisa.** O que falta é calculado em
`motor/src/requisitos.js` — código, não IA: regra de negócio não é interpretação, e
assim a lógica sobrevive a troca de modelo.

A mudança que faz o bot trabalhar sozinho:

| cliente pergunta | falta documento? | o bot |
| --- | --- | --- |
| "quanto libera?" | sim | **pede o documento ao cliente** |
| "quanto libera?" | não | chama você, com o dossiê pronto |

Antes, toda pergunta de dinheiro virava pendência na hora — mas "quanto libera?" sem
contracheque na mão não é pergunta pra você, é pergunta que ninguém pode responder
ainda. Isso não fura a regra de ouro: o que sai é uma pergunta, sem número nenhum.

No máximo **dois pedidos por mensagem**, e ele desiste de pedir o que já pediu duas
vezes — insistir na terceira não traz o documento, traz bloqueio.

## Quem pensa e quem escreve

Dois papéis, dois modelos, trocáveis por variável de ambiente:

- **Pensar** (classificar, extrair fatos) — Ollama local. Vê a mensagem crua, inclusive
  quando fala de dinheiro. Não sai da máquina.
- **Escrever** (a mensagem que o cliente lê) — Groq, se `GROQ_API_KEY` estiver
  configurada; senão o local. Sem chave tudo continua funcionando, só sai mais duro.

**Nenhum dos dois é fonte de verdade para número.** Valor, parcela, saldo, margem e
taxa vêm de você ou do banco de dados. A IA decide *como* responder, nunca *qual* é o
dado — garantido em `gatilhos.js` (corta antes) e `numeros.js` (confere depois).

## O ciclo completo

```
cliente pergunta  →  Fila  →  você digita só o dado ("R$ 4.200, 12x de 380")
                                     ↓
                        motor escreve no seu tom  →  Rascunhos
                                     ↓
                    você lê, edita se quiser, aprova  →  WhatsApp do cliente
                                     ↓
                     a mensagem aprovada vira exemplo em "Meu jeito"
```

Nada é enviado sem passar pela sua aprovação, e o que sai é exatamente o texto que
estava na tela quando você clicou.

## Publicar na Vercel

Importe o repositório e, nas configurações do projeto:

- **Root Directory:** `painel`
- **Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Deployment Protection → Vercel Authentication:** desligado, senão só o dono da
  conta Vercel consegue abrir o painel

As duas variáveis são `NEXT_PUBLIC_`, ou seja, são gravadas no bundle na hora do
build. Mudou o valor, precisa **redeploy** — não basta salvar.

O `motor/` fica de fora do deploy: ele só existe na máquina do consultor.

## Estrutura

```
banco/          SQL das tabelas e das políticas de RLS
painel/         Next.js 16 + TypeScript + Tailwind v4
  app/          rotas: (conta) login/cadastro, (painel) fila e afins
  components/   marca, ui, fila, painel, conta
  lib/          clientes do Supabase, ações de servidor, tipos
  proxy.ts      sessão e rotas protegidas (era middleware.ts até o Next 15)
motor/          Node local
  src/
    index.js      liga tudo e desliga limpo no Ctrl+C
    ambiente.js   lê e confere o .env
    supabase.js   login na conta, com sessão guardada em arquivo
    estado.js     espelha o estado do motor na tabela conexoes (batida de 30s)
    whatsapp.js   cliente do WhatsApp, QR e eventos
    gatilhos.js   A REGRA DE OURO — o que nunca chega na IA
    classificar.js  regra rígida + Ollama, nessa ordem
    redator.js    escreve no seu tom (few-shot) e se recusa a inventar número
    fluxo.js      decide entre abrir pendência ou escrever rascunho
    escuta.js     ouve o painel: respostas da fila e rascunhos aprovados
  test/           teste da regra de ouro — 40 frases reais
  sessao/         credenciais do pareamento — gitignorado
```

## Identidade

Base preto-tinta quente (`#14110E`), neutros quentes, texto papel. Uma cor de destaque:
jade `#1FA173`, usada só no item ativo do menu, na ação primária e no sinal do motor.
Brasa `#E08A3C` é semântico — só aparece para dizer que um cliente está esperando
demais. Bricolage Grotesque no wordmark e nos títulos, Geist na interface, Geist Mono
em todo número. Escuro por padrão, claro disponível em **Conta → Tema**.
