import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import CheckoutForm from '@/components/CheckoutForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Checkout' }

export default function CheckoutPage() {
  // Token de uso único para evitar reenvio do mesmo checkout.
  const nonce = randomUUID()

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-neutral-800">Finalizar compra</h1>
      <CheckoutForm nonce={nonce} />
    </main>
  )
}
