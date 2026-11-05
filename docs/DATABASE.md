# Banco de dados da demonstração

A Bella&Cheirosa demonstrativa usa **um único PostgreSQL, exclusivo, no Supabase
(plano Free)**, acessado pelo Prisma. Login (Auth.js), imagens (Cloudinary) e
hospedagem (Vercel) não mudam. Este é o banco de **produção da demonstração**: todos os
comandos de escrita usam o alvo `production`.

O banco antigo da loja (Railway) é preservado sem alterações e nunca recebe escrita dos
scripts deste repositório. Veja [Histórico](#histórico).

## Variáveis de conexão

| Variável | Valor (Supabase → Connect → ORMs → Prisma) | Onde fica |
|---|---|---|
| `DATABASE_URL` | Transaction pooler, porta 6543, com `?pgbouncer=true&connection_limit=1` | `.env.local` e Vercel |
| `DIRECT_URL` | Session pooler, porta 5432 | só `.env.local` |

A conexão direta (`db.<ref>.supabase.co`) também é aceita como `DIRECT_URL`, mas no
plano Free ela só funciona por IPv6. Prefira o Session pooler.

### Como cada ferramenta carrega as variáveis

| Ferramenta | `.env` | `.env.local` |
|---|---|---|
| Next.js (`dev`, `build`, `start`) | lê | lê, **com prioridade** |
| Prisma CLI chamado diretamente (`npx prisma …`) | lê sozinho | **não lê** |
| `npm run db:*` e `npm run prisma:studio` | lê (via Prisma) | lê via `--env-file=.env.local`, **com prioridade** |
| Vercel | — | — (só as variáveis do painel) |

- **Nunca** rode `npx prisma …` direto: sem o `.env.local`, ele usaria a `DATABASE_URL`
  do `.env`. Use os scripts npm.
- Sem `.env.local`, os scripts `db:*` param com erro antes de conectar.
- Não use `npx auth secret` nem `vercel env pull`: os dois gravam no `.env.local`.

### Qual URL cada operação usa

| Operação | URL | Observações |
|---|---|---|
| Loja e painel (Next.js, local e Vercel) | `DATABASE_URL` (6543) | `src/lib/prisma.ts` |
| `db:status` | `DIRECT_URL` (ou `DATABASE_URL` se ela faltar) | somente leitura |
| `db:migrate` | leitura de checagem por `DIRECT_URL`; `prisma migrate deploy` por `directUrl` = `DIRECT_URL` | binário local do Prisma, sem `npx` |
| `db:init`, `db:seed` | `DIRECT_URL` (**obrigatória**) | |
| `prisma:studio` | `DIRECT_URL` (`directUrl` do schema) | |
| Fotografia do banco antigo | `DATABASE_URL` do arquivo indicado em `--env-file` | somente leitura |

Sempre que `DIRECT_URL` existe, os scripts conferem se ela aponta para o mesmo banco da
`DATABASE_URL`. No Supabase, isso significa mesmo *project ref* e mesmo database; em
outros provedores, mesmo host, usuário e database. Mensagens de erro nunca incluem
usuário nem senha.

## Como o isolamento é garantido

| Camada | O que faz |
|---|---|
| Identificação do servidor | `pg_control_system().system_identifier`, lido só depois de conferir a permissão (`has_function_privilege`). O id do banco antigo está em `LEGACY_SYSTEM_IDENTIFIERS` (`src/lib/demo-db/guard.ts`) e é sempre recusado. Servidor sem id identificável também é recusado. |
| Marcador de demonstração | `db:init` grava `Setting["deployment.environment"]`, e só num banco com schema completo e tabelas de negócio vazias. `db:seed` exige esse marcador, do mesmo alvo e do mesmo servidor. |
| Alvo explícito | `--target=production` exige também `--yes-production`. O alvo `development` existe no código para um eventual banco local, mas não há nenhum configurado. |
| Escrita só com `.env.local` | `migrate`, `init` e `seed` exigem `DIRECT_URL`, que o `.env` antigo não define. |
| Leitura protegida | Sessão com `default_transaction_read_only=on` **e** transação `READ ONLY` conferida antes de qualquer consulta. Se o pooler recusar o parâmetro de sessão, o `db:status` falha antes de ler qualquer coisa: o erro é seguro e será analisado antes de mudar algo. |
| Sem atalhos perigosos | Sem seed automático do Prisma; nenhum script usa `migrate dev`, `migrate reset` ou `db push` (travado por `src/lib/demo-db/npm-scripts.test.ts`). |
| Fotografia | `scripts/legacy-snapshot.ts` (somente leitura) prova que o banco antigo não mudou. |

> **Supabase e `pg_control_system()`:** se o usuário do Supabase não tiver permissão
> para essa função, o `db:status` mostrará "servidor (id): não identificado" e todas as
> escritas recusadas. Nesse caso, a forma de identificação será revista com evidência
> antes de qualquer escrita. A recusa do banco antigo continua valendo.

## Comandos

```bash
npm run db:status                                              # somente leitura
npm run db:migrate -- --target=production --yes-production     # prisma migrate deploy
npm run db:init    -- --target=production --yes-production     # marca o banco como demonstração
npm run db:seed    -- --target=production --yes-production     # admin + 32 produtos + estoque inicial
```

O seed é idempotente: rodar de novo não duplica registros, não soma estoque e não troca
a senha de um admin existente.

Fotografia do banco antigo (somente leitura), usando a cópia guardada fora do projeto:

```bash
npx tsx --env-file="C:/Users/Nicole/.secrets/bella-cheirosa/railway-legado.env" \
  scripts/legacy-snapshot.ts --compare .snapshots/legacy-2026-11-05T12-38-30-625Z.json
```

## Ações manuais

### 1. `.env.local` (raiz do projeto, fora do git)

```
DATABASE_URL="<Transaction pooler, porta 6543, com ?pgbouncer=true&connection_limit=1>"
DIRECT_URL="<Session pooler, porta 5432>"
ADMIN_EMAIL="<e-mail do admin da demonstração>"
ADMIN_PASSWORD="<mínimo de 10 caracteres>"
ADMIN_NAME="<nome exibido no painel>"
```

`ADMIN_*` são lidas **somente pelo seed**, para criar a conta OWNER; o login lê o banco.
**Se o `.env.local` não as definir, o seed usará as do `.env`, que são as do painel
antigo.**

### 2. Supabase: desativar a Data API

Project Settings → **Data API** → desativar, ou remover `public` de "Exposed schemas".

A aplicação não usa a API REST, o Auth, o Storage nem o Realtime do Supabase: ela
conecta direto no Postgres pelo Prisma. Sem essa ação, as tabelas do schema `public`
ficariam acessíveis pela API com a chave `anon`, que é pública.

### 3. Vercel (somente quando a produção for aprovada)

| Variável | Production |
|---|---|
| `DATABASE_URL` | Transaction pooler (6543) com `?pgbouncer=true&connection_limit=1` |
| `AUTH_SECRET` | valor próprio |
| `AUTH_URL` | `https://<domínio>.vercel.app` |
| `AUTH_TRUST_HOST` | `true` |
| `NEXT_PUBLIC_STORE_NAME` / `_TAGLINE` / `_WHATSAPP_NUMBER` | dados da Bella&Cheirosa |
| Cloudinary | as mesmas chaves (a API Secret nunca com `NEXT_PUBLIC_`) |
| Mercado Pago / Melhor Envio | somente teste/sandbox |
| `DIRECT_URL`, `ADMIN_*`, `WHATSAPP_*` | **não definir** |

O build (`prisma generate && next build`) não precisa de `DIRECT_URL`.

### Plano Free

Projetos inativos por cerca de uma semana são pausados. Reative o projeto no painel
antes de apresentar a loja.

## Histórico

- **Banco antigo:** PostgreSQL no Railway, projeto `resilient-youth`, database
  `railway`, identificador do servidor `7678803170604773431`. Contém os dados da loja
  original: 1 usuário, 24 produtos, 9 categorias, 7 marcas, 1 pedido e 1 pagamento. É
  mantido intacto e não deve ser usado como destino.
- **Fotografia C.0 (2026-11-05):** `.snapshots/legacy-2026-11-05T12-38-30-625Z.json`
  (fora do git), com contagens, datas e hashes. Comparações posteriores: idêntico.
- **Conexão antiga preservada:** `C:\Users\Nicole\.secrets\bella-cheirosa\railway-legado.env`,
  fora de qualquer repositório e do OneDrive, com acesso restrito ao usuário do Windows.
  Serve só para recuperação e leitura. A `DATABASE_URL` antiga ainda está no `.env` e só
  será removida com autorização.
- **Decisões descartadas:** um novo banco no Railway (dois ambientes) e um Postgres local
  em Docker para desenvolvimento (Docker não está instalado). Em 2026-11-05 ficou
  decidido usar o Supabase como banco único da demonstração.
