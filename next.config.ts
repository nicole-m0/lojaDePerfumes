import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Há um package-lock.json solto em C:\Users\Nicole — fixa a raiz neste projeto.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    remotePatterns: [
      // Cloudinary (Fase 1) — ajuste o hostname quando o cloud name estiver definido.
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
}

export default nextConfig
