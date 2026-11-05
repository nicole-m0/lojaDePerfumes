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
| `DATABASE_URL` | Transaction pooler, porta 6543, com `?pgbouncer=true&connection_limit=1&sslmode=require` | `.env.local` e Vercel |
| `DIRECT_URL` | Session pooler, porta 5432, com `?sslmode=require` | só `.env.local` |

Se a URL copiada do painel não tiver `sslmode=require`, acrescente-o nas duas URLs.

A conexão direta (`db.<ref>.supabase.co`) **não é aceita**: só os poolers.

### Validação de destino (todos os comandos de banco)

`db:status`, `db:migrate`, `db:init`, `db:seed` e `prisma:studio` passam por
`scripts/demo-db.ts` → `src/lib/demo-db/cli.ts`, que, **antes de carregar o Prisma**:

1. lê `DATABASE_URL` e `DIRECT_URL` **do próprio arquivo `.env.local`** (`env-file.ts`).
   Variável ausente, vazia ou com valor diferente no processo (variável do sistema) →
   recusa. Não há fallback de uma URL para a outra nem para o `.env`;
2. exige os poolers do projeto Supabase da demonstração (`assertDemoPoolerPair`,
   `connection.ts`), com o Project Reference fixado em `DEMO_SUPABASE_PROJECT_REF`:

| Regra | `DATABASE_URL` | `DIRECT_URL` |
|---|---|---|
| host | `aws-N-<região>.pooler.supabase.com` | o mesmo host |
| usuário | `postgres.<DEMO_SUPABASE_PROJECT_REF>` | igual |
| database | `/postgres` | `/postgres` |
| porta | `6543` | `5432` |
| parâmetros permitidos (lista fechada) | `pgbouncer=true` (obrigatório), `sslmode=require` (obrigatório), `connection_limit` (opcional, inteiro positivo) | `sslmode=require` (obrigatório) |
| recusado | qualquer outro parâmetro (ex.: `host=`, `schema=`, `options=`), parâmetro repetido, fragmento `#` | igual |
| sempre | senha presente | igual |

3. no `seed`, aplica a mesma regra a `ADMIN_*` (`resolveDemoAdminVars`, `target.ts`):
   `ADMIN_EMAIL` e `ADMIN_PASSWORD` obrigatórias no arquivo e iguais no processo;
   `ADMIN_NAME` opcional — se ausente do arquivo, o valor do processo é ignorado.

Por que ler o arquivo, e não `process.env`: o `@prisma/client`, ao ser importado,
carrega o `.env` da raiz (banco antigo) e preenche as variáveis ausentes. Nada no
caminho dos scripts importa o Prisma estaticamente (travado por
`npm-scripts.test.ts`); ele só é carregado depois da validação.

O `prisma migrate deploy` roda com um ambiente **mínimo e explícito** (`migrateEnv`,
`cli.ts`): só variáveis de sistema (caminhos, temporários, perfil do Windows), as duas
URLs validadas e `CHECKPOINT_DISABLE=1`. O Prisma CLI ainda lê o `.env` por conta
própria, mas não sobrescreve `DATABASE_URL`/`DIRECT_URL` já definidas.

**Mensagens de erro:** as da validação citam só o nome da variável e a regra violada,
nunca URL, usuário, senha ou valores de parâmetro. Depois da validação, erros de
conexão do próprio Prisma (ex.: autenticação, P1000) podem citar host e **usuário**
(`postgres.<ref>`, que não é segredo) — nunca a senha.

### Como cada ferramenta carrega as variáveis

| Ferramenta | `.env` | `.env.local` |
|---|---|---|
| Next.js (`dev`, `build`, `start`) | lê (preenche o que faltar) | lê, **com prioridade** |
| Prisma CLI chamado diretamente (`npx prisma …`) | lê sozinho | **não lê** |
| `npm run db:*` e `npm run prisma:studio` | ignorado para conexão e admin | **fonte única** (lido do arquivo e validado) |
| Vercel | — | — (só as variáveis do painel) |

- **Nunca** rode `npx prisma …` direto: sem o `.env.local`, ele usaria a `DATABASE_URL`
  do `.env`. Use os scripts npm.
- Sem `.env.local`, os scripts param com erro antes de conectar.
- Não use `npx auth secret` nem `vercel env pull`: os dois gravam no `.env.local`.

### Qual URL cada operação usa

| Operação | URL | Observações |
|---|---|---|
| Loja e painel (Next.js, local e Vercel) | `DATABASE_URL` (6543) | `src/lib/prisma.ts` |
| `db:status` | `DIRECT_URL` (5432) | somente leitura |
| `db:migrate` | leitura de checagem por `DIRECT_URL`; `prisma migrate deploy` por `directUrl` = `DIRECT_URL` | binário local do Prisma, sem `npx`; o processo filho recebe as duas URLs validadas |
| `db:init`, `db:seed` | `DIRECT_URL` (5432) | |
| `prisma:studio` | Prisma Studio local, com as duas URLs validadas no processo filho | |
| Fotografia do banco antigo | `DATABASE_URL` do arquivo indicado em `--env-file` | somente leitura; não usa a validação acima |

## Como o isolamento é garantido

| Camada | O que faz |
|---|---|
| Identificação do servidor | `pg_control_system().system_identifier`, lido só depois de conferir a permissão (`has_function_privilege`). O id do banco antigo está em `LEGACY_SYSTEM_IDENTIFIERS` (`src/lib/demo-db/guard.ts`) e é sempre recusado. Servidor sem id identificável também é recusado. |
| Marcador de demonstração | `db:init` grava `Setting["deployment.environment"]`, e só num banco com schema completo e tabelas de negócio vazias. `db:seed` exige esse marcador, do mesmo alvo e do mesmo servidor. |
| Alvo explícito | `--target=production` exige também `--yes-production`. O alvo `development` existe no código para um eventual banco local, mas não há nenhum configurado. |
| Destino fixado | Todos os comandos exigem, no próprio `.env.local`, os poolers do projeto Supabase `DEMO_SUPABASE_PROJECT_REF` (ver [Validação de destino](#validação-de-destino-todos-os-comandos-de-banco)). |
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

O seed **só cria o que não existe e nunca altera um registro existente**
(`src/lib/demo-db/seed.ts`). Pode rodar de novo quantas vezes for preciso: ele só
completa o que falta, inclusive depois de uma execução interrompida.

| Registro | Se já existe | Se não existe |
|---|---|---|
| Admin (`ADMIN_EMAIL`) | não altera nada: não promove, não reativa, não troca nome nem senha | cria como OWNER |
| Categoria / marca | reaproveita (pelo slug, depois pelo nome), sem alterar | cria |
| Produto (slug) | não toca: dados, status (inclusive arquivado), especificações, imagens e estoque | cria produto + especificações + imagens + entrada de estoque inicial numa **única transação** |

- Edições feitas no painel nunca são desfeitas pelo seed.
- Se uma criação falhar, a transação daquele produto é desfeita por inteiro (nada
  órfão); rodar de novo cria o que faltou.
- Execuções simultâneas: o slug/e-mail/nome únicos fazem a segunda falhar ao criar; o
  seed trata o conflito como "já existente" — sem registros nem estoque em dobro.
- Consequência: mudanças em `src/data/demo-catalog.ts` depois do primeiro seed **não**
  chegam aos produtos já criados; ajuste-os pelo painel.

Fotografia do banco antigo (somente leitura), usando a cópia guardada fora do projeto:

```bash
npx tsx --env-file="C:/Users/Nicole/.secrets/bella-cheirosa/railway-legado.env" \
  scripts/legacy-snapshot.ts --compare .snapshots/legacy-2026-11-05T12-38-30-625Z.json
```

## Ações manuais

### 1. `.env.local` (raiz do projeto, fora do git)

```
DATABASE_URL="<Transaction pooler, porta 6543, com ?pgbouncer=true&connection_limit=1&sslmode=require>"
DIRECT_URL="<Session pooler, porta 5432, com ?sslmode=require>"
ADMIN_EMAIL="<e-mail do admin da demonstração>"
ADMIN_PASSWORD="<mínimo de 10 caracteres>"
ADMIN_NAME="<nome exibido no painel>"
```

`ADMIN_*` são lidas **somente pelo seed**, para criar a conta OWNER; o login lê o banco.
`ADMIN_EMAIL` e `ADMIN_PASSWORD` precisam estar **no `.env.local`**: o seed recusa
valores que só existam no `.env` (os do painel antigo) ou que difiram do processo. Sem `ADMIN_NAME` no arquivo, usa
"Administração".

### 2. Supabase: desativar a Data API

Project Settings → **Data API** → desativar, ou remover `public` de "Exposed schemas".

A aplicação não usa a API REST, o Auth, o Storage nem o Realtime do Supabase: ela
conecta direto no Postgres pelo Prisma. Sem essa ação, as tabelas do schema `public`
ficariam acessíveis pela API com a chave `anon`, que é pública.

### 3. Vercel (somente quando a produção for aprovada)

| Variável | Production |
|---|---|
| `DATABASE_URL` | Transaction pooler (6543) com `?pgbouncer=true&connection_limit=1&sslmode=require` |
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
