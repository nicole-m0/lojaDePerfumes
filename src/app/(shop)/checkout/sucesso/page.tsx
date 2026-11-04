import type { Metadata } from 'next'
import { getOrderConfirmation } from '@/server/orders'
import { isMercadoPagoConfigured } from '@/lib/mercadopago'
import CheckoutSuccess from '@/components/CheckoutSuccess'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pedido recebido',
  // A URL carrega um token de acesso ao resumo do pedido — não indexar nem vazar via Referer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

interface PageProps {
  searchParams: Promise<{ pedido?: string; token?: string }>
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const { pedido, token } = await searchParams
  const parsed = Number(pedido)
  const number = Number.isInteger(parsed) && parsed > 0 ? parsed : null

  // Só mostra dados do pedido com token válido (ver getOrderConfirmation).
  // Retorno do cliente a esta página NÃO confirma pagamento: o status exibido é
  // o que está no banco, atualizado apenas pelo webhook/reconsulta/admin.
  const order = number ? await getOrderConfirmation(number, token).catch(() => null) : null

  return <CheckoutSuccess order={order} onlinePayment={isMercadoPagoConfigured()} />
}
