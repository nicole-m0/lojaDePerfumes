import type { Metadata } from 'next'
import CheckoutReturnNotice from '@/components/CheckoutReturnNotice'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pagamento em análise' }

interface PageProps {
  searchParams: Promise<{ pedido?: string }>
}

export default async function CheckoutPendingPage({ searchParams }: PageProps) {
  const { pedido } = await searchParams
  const parsed = Number(pedido)
  const number = Number.isInteger(parsed) && parsed > 0 ? parsed : null

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <CheckoutReturnNotice variant="pending" orderNumber={number} />
    </main>
  )
}
