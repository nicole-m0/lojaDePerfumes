import { Suspense } from 'react'
import { CartProvider } from '@/context/CartContext'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CartDrawer from '@/components/CartDrawer'
import CartToast from '@/components/CartToast'
import WhatsAppButton from '@/components/WhatsAppButton'

export default function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <CartProvider>
      <Suspense fallback={<div className="h-[65px] border-b border-venus-100 bg-white/80" />}>
        <Header />
      </Suspense>
      {children}
      <Footer />
      <CartDrawer />
      <CartToast />
      <WhatsAppButton />
    </CartProvider>
  )
}
