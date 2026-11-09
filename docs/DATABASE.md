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

Configuração da **D4**: demonstração publicada na Vercel, com Mercado Pago em ambiente
de **teste** e frete demonstrativo. Valores reais só no painel da Vercel
(Settings → Environment Variables, ambiente Production) — nunca no repositório.

#### Regiões

| Serviço | Região |
|---|---|
| Supabase (banco da demonstração) | `us-east-2` |
| Vercel Functions (recomendada) | `cle1` (Cleveland, AWS `us-east-2`), se disponível no plano — mesma região AWS do banco |

No plano Hobby as funções rodam em uma única região. Confira no painel do projeto
(Settings → Functions) qual região está ativa antes dos testes.

#### Banco: runtime × Prisma CLI

| Variável | Na Vercel | Uso |
|---|---|---|
| `DATABASE_URL` | **definir** | Conexão do Supabase pelo **transaction pooler** (porta 6543) com `?pgbouncer=true&connection_limit=1&sslmode=require`. É a única URL usada pelo Prisma Client em runtime (loja, painel, webhook). |
| `DIRECT_URL` | **não definir** | Session pooler (5432), necessária só para as operações **locais** do Prisma CLI (`npm run db:*`, migrations), lida do `.env.local`. O build (`prisma generate && next build`) não conecta ao banco e não precisa dela; o Prisma Client gerado não a utiliza em runtime. |

#### Variáveis da D4

| Variável | Production | Observações |
|---|---|---|
| `DATABASE_URL` | transaction pooler (ver acima) | runtime |
| `AUTH_SECRET` | valor próprio | runtime; também assina os links de confirmação do pedido nas páginas de retorno do checkout |
| `AUTH_URL` | `https://<projeto>.vercel.app` | ver [URL pública e Mercado Pago](#url-pública-e-mercado-pago) |
| `AUTH_TRUST_HOST` | `true` | |
| `NEXT_PUBLIC_STORE_NAME` / `_TAGLINE` | dados da Bella&Cheirosa (opcionais: há padrão no código) | **build** (embutidas no bundle) |
| `NEXT_PUBLIC_STORE_WHATSAPP_NUMBER` | opcional: número real da loja, só dígitos, `55` + DDD + número | **build**; ver [WhatsApp](#whatsapp) |
| `MERCADOPAGO_ACCESS_TOKEN` | access token de **teste** | runtime; nunca credencial de produção na D4 |
| `MERCADOPAGO_WEBHOOK_SECRET` | assinatura secreta do webhook (painel do Mercado Pago) | runtime; sem ela o webhook recusa tudo (401) |
| `SHIPPING_DEMO_MODE` | `true` | runtime; liga o frete demonstrativo (ver abaixo) |
| `SHIPPING_DEMO_FLAT_CENTS` | opcional (padrão `1990` = R$ 19,90) | runtime |
| `SHIPPING_ORIGIN_ZIP` | opcional | no modo demo só fica registrado no pedido |
| Cloudinary | ver [Cloudinary](#cloudinary-públicas--segredos) | |
| `DIRECT_URL`, `ADMIN_*`, `MELHORENVIO_*`, `WHATSAPP_*`, `NFE_PROVIDER_TOKEN` | **não definir** | |

Variáveis `NEXT_PUBLIC_*` são lidas no **build**: precisam existir antes do deploy, e
alterar o valor exige um novo deploy. As demais são lidas em runtime (alterar também
pede redeploy para valer).

#### Frete demonstrativo

- Com `SHIPPING_DEMO_MODE=true` (valor exato) e sem Melhor Envio configurado, o checkout
  oferece uma única opção, "Frete simulado", com valor fixo (`SHIPPING_DEMO_FLAT_CENTS`,
  padrão R$ 19,90) e prazo fictício de 5–8 dias úteis. Checkout e painel identificam a
  opção como simulação; nenhuma transportadora é consultada.
- **`MELHORENVIO_*` sem configuração durante a D4:** com `MELHORENVIO_TOKEN` e CEP de
  origem válidos, o Melhor Envio tem prioridade e o frete simulado não aparece. Uma falha
  do Melhor Envio configurado bloqueia o checkout (não cai no simulado).
- Sem nenhum dos dois, o checkout não avança para o pagamento.

#### Cloudinary: públicas × segredos

| Variável | Tipo | Quando é lida |
|---|---|---|
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | pública (vai ao navegador) | build |
| `NEXT_PUBLIC_CLOUDINARY_API_KEY` | pública — mesmo valor de `CLOUDINARY_API_KEY` | build |
| `CLOUDINARY_API_KEY` | exclusiva do servidor | runtime |
| `CLOUDINARY_API_SECRET` | **segredo**, exclusiva do servidor (`src/lib/cloudinary.ts`, protegido por `server-only`, e rota `/api/cloudinary/sign`) | runtime |

A API Secret **nunca** recebe o prefixo `NEXT_PUBLIC_`. Ao cadastrar, confira que
`NEXT_PUBLIC_CLOUDINARY_API_KEY` contém a API Key, e não a Secret.

#### WhatsApp

`WHATSAPP_*` ficam **sem configuração** durante a D4 e os testes: configuradas, a
confirmação automática do pedido e as mudanças de status enviariam mensagens reais aos
telefones informados nos pedidos de teste. Sem elas, o envio é ignorado
(`not_configured`) sem afetar o pedido.

`NEXT_PUBLIC_STORE_WHATSAPP_NUMBER` é outra coisa: o WhatsApp **da loja** (links
`wa.me`), sem relação com `WHATSAPP_*`. É **opcional** e controla os cinco pontos de
contato da loja: botão flutuante, rodapé, página da sacola, gaveta da sacola e página de
produto. Formato: só dígitos, `55` + DDD + número (12 ou 13 dígitos). **Sem número
válido** (ausente, vazio ou fora do formato), todos os links e menções de atendimento
pelo WhatsApp ficam ocultos — não há número fictício de reserva. Por ser `NEXT_PUBLIC_*`,
cadastrar ou trocar o número exige um novo deploy.

#### URL pública e Mercado Pago

`AUTH_URL` precisa ser uma URL **HTTPS, estável e sem barra final** — o domínio de
produção do projeto (`https://<projeto>.vercel.app`) enquanto não houver domínio
próprio. Nunca uma URL de preview ou de um deploy específico, que muda a cada deploy.

A partir dela, `src/lib/mercadopago.ts` monta, para cada pedido:

| URL | Valor |
|---|---|
| Webhook (`notification_url`) | `{AUTH_URL}/api/webhooks/mercadopago` |
| Retorno (`back_urls`) | `{AUTH_URL}/checkout/sucesso`, `/checkout/falha`, `/checkout/pendente` (com número e token do pedido) |

- Sem `AUTH_URL`, a base cai em `http://localhost:3000`: o webhook nunca chega e o
  cliente não volta para a loja.
- `auto_return` só é enviado com base HTTPS.
- As URLs ficam gravadas na preferência de cada pedido: trocar `AUTH_URL` depois (ex.:
  domínio próprio) não altera pedidos já criados. Ao trocar, faça novo deploy e
  atualize a URL do webhook no painel do Mercado Pago.

> **Não use previews protegidos para os testes do Mercado Pago.** Deploys de preview
> ficam atrás da Deployment Protection da Vercel: o webhook receberia a tela de
> autenticação da Vercel em vez da aplicação, e o cliente, ao voltar do Mercado Pago,
> também. Faça os testes externos no deploy de **produção**, conferindo no painel da
> Vercel que o domínio de produção está público. Os previews podem continuar
> protegidos. O painel administrativo não depende dessa proteção: ele exige login e
> papel de equipe na própria aplicação. Não use o bypass da proteção (segredo na URL)
> nas URLs enviadas ao Mercado Pago — as URLs de retorno são abertas pelo navegador do
> cliente.

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
