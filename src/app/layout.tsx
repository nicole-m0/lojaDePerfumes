import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import { STORE_NAME, STORE_TAGLINE } from '@/config/store'
import './globals.css'

// Fontes self-hosted pelo next/font (sem requisição ao Google no navegador).
// Ambas sob licença SIL Open Font License. O subset "latin" cobre os acentos do português.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const DESCRIPTION = `${STORE_NAME} — perfumaria e autocuidado: perfumes, hidratantes e presentes. ${STORE_TAGLINE.replace(/\.$/, '')}.`

// Ícones: src/app/icon.svg (favicon) e src/app/apple-icon.tsx (iOS), pelas
// convenções de arquivo do App Router — não precisam ser declarados aqui.
export const metadata: Metadata = {
  title: {
    default: `${STORE_NAME} | Perfumaria`,
    template: `%s | ${STORE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: STORE_NAME,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: STORE_NAME,
    title: `${STORE_NAME} | Perfumaria`,
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: '#92425f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${cormorant.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  )
}
