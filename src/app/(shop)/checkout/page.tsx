import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import CheckoutForm from '@/components/CheckoutForm'
import { Container, Eyebrow } from '@/components/shop/ui'
import { isMercadoPagoConfigured } from '@/lib/mercadopago'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Checkout' }

export default function CheckoutPage() {
  // Token de uso único para evitar reenvio do mesmo checkout.
  const nonce = randomUUID()

  return (
    <main className="flex-1 py-12 sm:py-16">
      <Container>
        <Eyebrow>Checkout</Eyebrow>
        <h1 className="mb-10 mt-3 text-5xl font-medium text-ink sm:text-6xl">Finalizar compra</h1>
        <CheckoutForm nonce={nonce} onlinePayment={isMercadoPagoConfigured()} />
      </Container>
    </main>
  )
}
