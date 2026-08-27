import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Testes rodam em Node e não importam CSS — evita carregar o postcss.config.mjs
  // (formato do Next, incompatível com o loader do Vite).
  css: {
    postcss: {},
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
