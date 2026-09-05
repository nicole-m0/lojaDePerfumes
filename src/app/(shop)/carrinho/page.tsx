import type { Metadata } from 'next'
import CartView from '@/components/CartView'

export const metadata: Metadata = { title: 'Carrinho' }

export default function CarrinhoPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Seu carrinho</h1>
      <CartView />
    </main>
  )
}
