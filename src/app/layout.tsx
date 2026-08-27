import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Loja Vênus | Perfumes & Cosméticos',
    template: '%s | Loja Vênus',
  },
  description:
    'Loja Vênus — perfumes, cosméticos e presentes femininos. Beleza que floresce em você.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/favicon-180.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#f5177d',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
