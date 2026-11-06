import type { Metadata } from 'next'
import CheckoutReturnNotice from '@/components/CheckoutReturnNotice'
import { getOrderConfirmation } from '@/server/orders'
import { parseOrderNumberParam, parseTokenParam } from '@/lib/order-access'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Pagamento não concluído',
  // A URL carrega um token de acesso ao resumo do pedido — não indexar nem vazar via Referer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CheckoutFailurePage({ searchParams }: PageProps) {
  const params = await searchParams
  const number = parseOrderNumberParam(params.pedido)
  // Só mostra dados do pedido com token válido; o redirecionamento do Mercado Pago
  // (e os parâmetros que ele acrescenta) não confirmam nada.
  const order = number
    ? await getOrderConfirmation(number, parseTokenParam(params.token)).catch(() => null)
    : null

  return <CheckoutReturnNotice variant="failure" order={order} />
}
