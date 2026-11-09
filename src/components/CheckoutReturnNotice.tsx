import ResultPanel from './shop/ResultPanel'
import { ButtonLink, TextLink } from './shop/ui'
import { formatCents } from '../lib/format'
import { getReturnCopy, type ReturnVariant } from '../lib/checkout-copy'

// Páginas de retorno do Mercado Pago (pendente / falha). São APENAS UX — não
// alteram o estado do pedido. O texto vem do status GRAVADO no banco (webhook,
// reconsulta ou painel), lido com token válido; ver getReturnCopy.

interface CheckoutReturnNoticeProps {
  variant: ReturnVariant
  /** Resumo autorizado por token (getOrderConfirmation); `null` = sem acesso. */
  order: { number: number; paymentStatus: string; totalCents: number } | null
}

export default function CheckoutReturnNotice({ variant, order }: CheckoutReturnNoticeProps) {
  const c = getReturnCopy({ variant, order })

  return (
    <ResultPanel
      status={c.status}
      tone={c.tone}
      title={c.title}
      detail={
        c.showOrder && order ? (
          <>
            Pedido nº {order.number} · {formatCents(order.totalCents)}
          </>
        ) : undefined
      }
      actions={
        <>
          <ButtonLink href={c.cta.href}>{c.cta.label}</ButtonLink>
          {c.showContinue && <TextLink href="/">Continuar comprando</TextLink>}
        </>
      }
    >
      <p>{c.body}</p>
    </ResultPanel>
  )
}
