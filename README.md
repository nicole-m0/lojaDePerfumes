# Loja Vênus

Loja virtual de perfumes, cosméticos e presentes femininos.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL · Auth.js (NextAuth v5).

> Migrada de uma SPA Vite para Next.js full-stack na **Fase 0**. A loja pública
> mantém a mesma aparência; a fundação de banco, autenticação e painel
> administrativo já está no lugar para as próximas fases.

## Pré-requisitos

- Node.js 22+
- Um banco PostgreSQL (recomendado: [Railway](https://railway.app))

## Configuração

```bash
npm install
cp .env.example .env       # preencha DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npx auth secret            # gera e grava AUTH_SECRET no .env (ou defina manualmente)
npm run prisma:migrate     # cria as tabelas no banco
npm run db:seed            # cria o usuário administrador inicial
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
│   ├── (shop)/              # loja pública (Header/Footer/carrinho + páginas)
│   │   ├── page.tsx         # vitrine com busca e filtros
│   │   └── produto/[slug]/  # página de detalhe do produto
│   ├── (admin)/admin/
│   │   ├── login/           # login da equipe
│   │   └── (dashboard)/     # painel autenticado (shell + dashboard)
│   ├── api/
│   │   ├── auth/[...nextauth]/  # rotas do Auth.js
│   │   └── health/             # health check (app + banco)
│   ├── layout.tsx          # layout raiz (metadata, <html>)
│   ├── globals.css         # Tailwind v4 + tema "venus" + tokens shadcn
│   └── not-found.tsx
├── components/              # UI da loja + `ui/` (shadcn) + `admin/`
├── context/                # CartContext (carrinho em localStorage)
├── config/store.ts         # nome/WhatsApp/tagline (via env; vai para o banco na Fase 1)
├── data/products.ts        # catálogo estático (fonte do seed na Fase 1)
├── lib/                    # prisma, utils, format, whatsapp
├── auth.ts / auth.config.ts # configuração do Auth.js
└── middleware.ts           # protege /admin/*

prisma/
├── schema.prisma           # Fase 0: User/Account/Session + Setting
└── seed.ts                 # usuário admin inicial
```

## Deploy

- **App:** Vercel (defina as variáveis do `.env.example` no projeto).
- **Banco:** PostgreSQL no Railway (use a connection string interna em produção).

## Antes de publicar

- Número de WhatsApp e nome da loja: variáveis `NEXT_PUBLIC_STORE_*`.
- Catálogo: `src/data/products.ts` (até a migração para o banco na Fase 1).
- Logo/ícones: `public/favicon*.png`.
