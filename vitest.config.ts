import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Testes rodam em Node e não importam CSS — evita carregar o postcss.config.mjs
  // (formato do Next, incompatível com o loader do Vite).
  css: {
    postcss: {},
  },
  // JSX no runtime automático (como o Next) — permite testar componentes com
  // renderToStaticMarkup sem `import React`. Só afeta os testes; o build usa o SWC.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
