# Loja Vênus

Loja virtual de perfumes, cosméticos e presentes femininos.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL · Auth.js (NextAuth v5) · Cloudinary.

> **Fase 0** — migração da SPA Vite para Next.js full-stack (fundação de banco, auth e painel).
> **Fase 1** — catálogo no banco (categorias, marcas, produtos, imagens, especificações),
> CRUD no painel e upload de imagens via Cloudinary. A loja pública lê do banco e
> reflete os filtros na URL; sem imagem real, cai no degradê + ícone da SPA original.

## Pré-requisitos

- Node.js 22+
- Um banco PostgreSQL (recomendado: [Railway](https://railway.app))

## Configuração

```bash
npm install
cp .env.example .env       # preencha DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx auth secret            # gera e grava AUTH_SECRET no .env (ou defina manualmente)
npm run prisma:migrate     # cria as tabelas (auth + catálogo)
npm run db:seed            # cria o admin + popula o catálogo (data/products.ts)
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
| `npm run prisma:migrate` | cria/aplica migrations no banco de desenvolvimento |
| `npm run prisma:studio` | abre o Prisma Studio |
| `npm run db:seed` | popula o usuário admin (usa `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |

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
├── data/products.ts            # catálogo de origem — usado só pelo seed
├── lib/                        # prisma, cloudinary, utils, format, slug, whatsapp
├── auth.ts / auth.config.ts    # configuração do Auth.js
└── middleware.ts               # protege /admin/*

prisma/
├── schema.prisma               # auth + Setting + catálogo (Category/Brand/Product/…)
└── seed.ts                     # usuário admin + catálogo a partir de data/products.ts
```

## Deploy

- **App:** Vercel (defina as variáveis do `.env.example` no projeto).
- **Banco:** PostgreSQL no Railway (use a connection string interna em produção).

## Imagens (Cloudinary)

Opcional para desenvolvimento — sem as chaves, o admin aceita URL de imagem colada
e a loja usa o degradê + ícone como fallback. Para habilitar upload:

1. Crie uma conta em [cloudinary.com](https://cloudinary.com).
2. Preencha `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
3. Confira o hostname em `next.config.ts` (`images.remotePatterns`).

## Antes de publicar

- Número de WhatsApp e nome da loja: variáveis `NEXT_PUBLIC_STORE_*` (vão para a tabela `Setting` numa próxima fase).
- Catálogo: gerenciado no painel (`/admin/produtos`). `src/data/products.ts` é só a carga inicial do seed.
- Logo/ícones: `public/favicon*.png`.
