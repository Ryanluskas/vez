# Vez

Atendente de WhatsApp com IA para consultores de crédito.

O bot responde as dúvidas simples imitando o jeito de falar do consultor. Quando a
pergunta envolve **valor, quanto libera, parcela, simulação ou saldo**, ele não chuta:
congela aquela conversa, coloca a pergunta numa **fila em ordem de chegada** e segue
atendendo os outros clientes. O consultor responde no painel e a conversa volta a fluir.

Nesta versão **nada é enviado sozinho** — todo envio passa pela aprovação do consultor.

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
- [ ] **Fase 2** — motor local, WhatsApp, QR na tela Conexão
- [ ] **Fase 3** — classificação com Ollama, fila viva
- [ ] **Fase 4** — rascunhos, aprovar e enviar
- [ ] **Fase 5** — aprender o jeito de falar (few-shot)
- [ ] **Fase 6** — polimento

## Rodar o painel

**1. Criar o projeto no Supabase.** Em [supabase.com](https://supabase.com), plano
gratuito. Em *Project Settings → API*, copie a **Project URL** e a chave **anon
public**.

**2. Colar as chaves.** Copie `painel/.env.local.example` para `painel/.env.local` e
preencha. A chave `service_role` não entra aqui — quem protege os dados é o RLS.

**3. Criar as tabelas.** No *SQL Editor* do Supabase, rode nesta ordem:

- `banco/01_tabelas.sql`
- `banco/02_rls.sql`

O segundo é o que isola os dados de cada consultor. A consulta no fim dele confere:
as cinco tabelas têm que aparecer com `rls_ligado = true` e 4 políticas cada.

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

## Publicar na Vercel

Importe o repositório e, nas configurações do projeto:

- **Root Directory:** `painel`
- **Environment Variables:** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`

O `motor/` fica de fora do deploy — ele só existe na máquina do consultor.

## Estrutura

```
banco/          SQL das tabelas e das políticas de RLS
painel/         Next.js 16 + TypeScript + Tailwind v4
  app/          rotas: (conta) login/cadastro, (painel) fila e afins
  components/   marca, ui, fila, painel, conta
  lib/          clientes do Supabase, ações de servidor, tipos
  proxy.ts      sessão e rotas protegidas (era middleware.ts até o Next 15)
motor/          Node local — entra na Fase 2
```

## Identidade

Base preto-tinta quente (`#14110E`), neutros quentes, texto papel. Uma cor de destaque:
jade `#1FA173`, usada só no item ativo do menu, na ação primária e no sinal do motor.
Brasa `#E08A3C` é semântico — só aparece para dizer que um cliente está esperando
demais. Bricolage Grotesque no wordmark e nos títulos, Geist na interface, Geist Mono
em todo número. Escuro por padrão, claro disponível em **Conta → Tema**.
