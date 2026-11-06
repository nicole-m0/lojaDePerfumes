# Imagens e marca — origem e uso

Registro de todos os assets visuais do projeto Bella&Cheirosa (loja demonstrativa,
projeto de portfólio).

## Identidade

| Asset | Arquivo | Origem |
|---|---|---|
| Símbolo e logotipo | `src/components/brand/Logo.tsx` | Desenho original em SVG, criado para o projeto |
| Favicon | `src/app/icon.svg` | Mesmo símbolo, SVG original |
| Ícone iOS | `src/app/apple-icon.tsx` | Gerado no build a partir do símbolo |
| Fontes | Cormorant Garamond, Manrope | Google Fonts, licença SIL Open Font License, via `next/font` |

## Campanha (Etapa B.1)

Imagens **geradas por IA** no Canva (função de geração de imagens), a partir da
direção de arte da marca. Não representam produtos reais nem produtos específicos do
catálogo: são imagens institucionais. Sem marcas, logotipos de terceiros ou textos.

| Uso | Arquivo | Dimensões | Media id no Canva |
|---|---|---|---|
| Destaque da home | `src/assets/campaign/hero.png` | 1136×1408 (≈ 4:5) | `MAHZ-_IOjLM` |
| Seção de coleções | `src/assets/campaign/colecoes.png` | 1136×1408 (≈ 4:5) | `MAHZ-2sqb9U` |
| Faixa "O ateliê" | `src/assets/campaign/atelie.png` | 1776×896 (≈ 2:1) | `MAHZ-ysaqXU` |

- Arquivos PNG originais, sem conversão nem recompressão. O Canva os entregou com
  extensão `.jpg`; apenas a extensão foi corrigida para `.png` (conteúdo idêntico).
- Otimização feita pelo `next/image` no build/servidor (tamanhos responsivos, WebP/AVIF,
  placeholder desfocado). Nenhuma imagem é carregada de URL externa.
- Uso sujeito aos termos de uso do Canva para conteúdo gerado por IA.

## Produtos

As fotografias individuais dos produtos serão produzidas na Etapa C, junto com o
catálogo fictício. Até lá, a loja exibe um substituto tipográfico com o nome de cada
produto (`src/components/ProductVisual.tsx`) — nunca uma mesma imagem genérica.
