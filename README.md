# Bella&Cheirosa

E-commerce **demonstrativo** de perfumaria — projeto de portfólio. Produtos, marcas e
preços exibidos na demonstração são fictícios e nenhum pedido é entregue.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL · Auth.js (NextAuth v5) · Cloudinary.

Loja pública (catálogo, carrinho, checkout de teste) e painel administrativo (produtos,
pedidos, estoque, financeiro), com catálogo e pedidos no PostgreSQL. A demonstração usa um
banco exclusivo no Supabase e um catálogo fictício — veja [`docs/DATABASE.md`](docs/DATABASE.md).

## Identidade visual

Identidade original, criada para o projeto (sem logotipos, fotos ou textos de terceiros).

| Elemento | Definição |
|---|---|
| Conceito | "Ateliê de perfumaria": sofisticado, feminino e comercial, sem excesso decorativo |
| Símbolo | Frasco geométrico com brilho de quatro pontas — `src/components/brand/Logo.tsx` |
| Logotipo | "Bella&Cheirosa" em Cormorant Garamond, com o `&` em itálico champanhe |
| Favicon / ícone iOS | `src/app/icon.svg` e `src/app/apple-icon.tsx` (gerado no build) |
| Cor de marca | Bordô-rosé — tokens `brand-50…900` (primária `brand-600` `#92425f`) |
| Acento | Champanhe — tokens `champagne-50…700` (uso pontual) |
| Neutros | Marfim `ivory` `#fbf8f5` (fundo) e tinta `ink` `#2a1f24` (texto) |
| Tipografia | Cormorant Garamond (títulos `h1`/`h2`, marca) + Manrope (interface) — ambas OFL, via `next/font` |

Os tokens ficam em `src/app/globals.css` (`@theme`). O painel administrativo (shadcn/ui) usa as
mesmas cores pelas variáveis `--primary`, `--accent`, `--ring` etc. do mesmo arquivo.

## Pré-requisitos

- Node.js 22+
- O banco PostgreSQL da demonstração (Supabase) — configuração em [`docs/DATABASE.md`](docs/DATABASE.md)

## Configuração

```bash
npm install
cp .env.example .env       # AUTH_SECRET, Cloudinary, dados da loja…
# AUTH_SECRET: node -e "console.log(require('crypto').randomBytes(33).toString('base64'))"
# .env.local: DATABASE_URL, DIRECT_URL e ADMIN_* — veja docs/DATABASE.md
npm run db:status          # confere o banco de destino (somente leitura)
# migrate / init / seed: somente conforme docs/DATABASE.md
npm run dev
```

- Loja pública: http://localhost:3000
- Painel administrativo: http://localhost:3000/admin (login em `/admin/login`)
- Health check: http://localhost:3000/api/health

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | ambiente de desenvolvimento (Next) |
| `npm run build` | `prisma generate` + build de produção |
| `npm start` | sobe o build de produção |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes (Vitest) |
| `npm run prisma:generate` | gera o Prisma Client (não conecta no banco) |
| `npm run prisma:studio` | Prisma Studio no banco do `.env.local` |
| `npm run db:status` | banco de destino e o que é permitido nele (somente leitura) |
| `npm run db:migrate -- --target=…` | `prisma migrate deploy` protegido (só banco vazio ou demo marcado) |
| `npm run db:init -- --target=…` | grava o marcador de demonstração num banco novo e vazio |
| `npm run db:seed -- --target=…` | admin + catálogo fictício (`src/data/demo-catalog.ts`), só em banco demo |
| `npm run db:snapshot` | fotografia somente leitura do banco da `DATABASE_URL` do `.env`; para o banco antigo, use o comando de `docs/DATABASE.md` |

## Estrutura

```
src/
├── app/
│   ├── (shop)/                 # loja pública (lê do banco; filtros na URL)
│   │   ├── page.tsx            # vitrine com busca e filtros
│   │   ├── produto/[slug]/     # página de detalhe do produto
│   │   └── error.tsx           # fallback se o catálogo não carregar
│   ├── (admin)/admin/
│   │   ├── login/              # login da equipe
│   │   └── (dashboard)/        # painel autenticado
│   │       ├── produtos/       # lista + novo + [id] (CRUD) + actions.ts
│   │       └── categorias/     # categorias & marcas + actions.ts
│   ├── api/
│   │   ├── auth/[...nextauth]/ # rotas do Auth.js
│   │   ├── cloudinary/sign/    # assinatura de upload (staff)
│   │   └── health/             # health check (app + banco)
│   ├── layout.tsx · globals.css · not-found.tsx
├── components/                 # UI da loja + `ui/` (shadcn) + `admin/`
├── server/                     # camada de dados (server-only): catalog.ts, guard.ts
├── context/                    # CartContext (carrinho em localStorage)
├── config/store.ts             # nome/WhatsApp/tagline (via env)
├── data/demo-catalog.ts        # catálogo fictício — usado só pelo seed da demonstração
├── lib/                        # prisma, cloudinary, utils, format, slug, whatsapp
│   └── demo-db/                # proteção de isolamento + seed do banco de demonstração
├── auth.ts / auth.config.ts    # configuração do Auth.js
└── middleware.ts               # protege /admin/*

prisma/
├── schema.prisma               # auth + Setting + catálogo + pedidos/pagamentos/estoque…
└── migrations/                 # aplicadas só com `npm run db:migrate` (migrate deploy)

scripts/
├── demo-db.ts                  # status / migrate / init / seed (todos protegidos)
└── legacy-snapshot.ts          # fotografia de segurança (somente leitura)
```

## Deploy

- **App:** Vercel. A lista exata de variáveis (e as que **não** devem ir para a Vercel) está em `docs/DATABASE.md`.
- **Banco:** PostgreSQL no Supabase (Prisma). Na Vercel, só `DATABASE_URL` (Transaction pooler,
  porta 6543). Passo a passo em `docs/DATABASE.md`. Nunca rode `npx prisma` direto: use `npm run db:*`.

## Imagens (Cloudinary)

Opcional para desenvolvimento — sem as chaves, o admin aceita URL de imagem colada
e a loja mostra um substituto tipográfico com o nome do produto. Para habilitar upload:

1. Crie uma conta em [cloudinary.com](https://cloudinary.com).
2. Preencha `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
3. Confira o hostname em `next.config.ts` (`images.remotePatterns`).

## Antes de publicar

- Nome, slogan e WhatsApp da loja: variáveis `NEXT_PUBLIC_STORE_*`. **A variável tem prioridade sobre o
  padrão do código** — confira `NEXT_PUBLIC_STORE_NAME="Bella&Cheirosa"` no `.env` e na Vercel.
- Catálogo: gerenciado no painel (`/admin/produtos`). `src/data/demo-catalog.ts` é só a carga inicial do seed.
- Logo/ícones: `src/components/brand/Logo.tsx`, `src/app/icon.svg`, `src/app/apple-icon.tsx`.
