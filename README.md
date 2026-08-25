# Loja Vênus

Loja virtual de perfumes, cosméticos e presentes femininos. React + TypeScript + Vite + Tailwind CSS.

## Rodando localmente

```bash
npm install
npm run dev
```

## Antes de publicar

- **Número de WhatsApp e nome da loja**: edite `src/config/store.ts`.
- **Catálogo de produtos**: edite `src/data/products.ts` (nome, preço, categoria, marca, descrição, especificações). Cada produto usa um degradê + ícone como imagem provisória — troque por fotos reais quando tiver.
- **Logo**: o ícone da aba do navegador está em `public/favicon.svg`.

## Estrutura

- `src/pages/Home.tsx` — vitrine com busca, filtros (categoria, marca, preço, promoções) e grade de produtos.
- `src/pages/ProductDetail.tsx` — página de detalhes do produto (`/produto/:slug`), com especificações, quantidade, adicionar ao carrinho e compra direta via WhatsApp.
- `src/components/CartDrawer.tsx` — carrinho lateral; clicar em um item leva à página do produto.
- `src/context/CartContext.tsx` — estado do carrinho, persistido em `localStorage`.

## Scripts

- `npm run dev` — ambiente de desenvolvimento
- `npm run build` — build de produção
- `npm run preview` — pré-visualiza o build
- `npm run lint` — checagem de lint (oxlint)
