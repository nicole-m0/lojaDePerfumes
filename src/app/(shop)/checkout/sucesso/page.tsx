import type { Metadata } from 'next'
import { getOrderConfirmation } from '@/server/orders'
import CheckoutSuccess from '@/components/CheckoutSuccess'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pedido recebido' }

interface PageProps {
  searchParams: Promise<{ pedido?: string }>
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const { pedido } = await searchParams
  const parsed = Number(pedido)
  const number = Number.isInteger(parsed) && parsed > 0 ? parsed : null

  const order = number ? await getOrderConfirmation(number).catch(() => null) : null

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <CheckoutSuccess
        orderNumber={order?.number ?? number}
        totalCents={order?.totalCents ?? null}
        found={Boolean(order)}
      />
    </main>
  )
}
