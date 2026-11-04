import { Suspense } from 'react'
import { CartProvider } from '@/context/CartContext'
import { listShopCategories } from '@/server/catalog'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CartDrawer from '@/components/CartDrawer'
import CartToast from '@/components/CartToast'
import WhatsAppButton from '@/components/WhatsAppButton'

export default async function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Mesma leitura que o rodapé já fazia — agora também alimenta a navegação.
  const categories = await listShopCategories().catch(() => [])

  return (
    <CartProvider>
      <div data-surface="shop" className="flex min-h-svh flex-1 flex-col">
        <a
          href="#conteudo"
          className="sr-only z-[60] bg-ink px-4 py-3 text-sm text-ivory focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Pular para o conteúdo
        </a>
        <Suspense fallback={<div className="h-24 border-b border-hairline bg-ivory lg:h-28" />}>
          <Header categories={categories} />
        </Suspense>
        <div id="conteudo" className="flex flex-1 flex-col">
          {children}
        </div>
        <Footer categories={categories} />
        <CartDrawer />
        <CartToast />
        <WhatsAppButton />
      </div>
    </CartProvider>
  )
}
