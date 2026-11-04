'use client'

import { useEffect, useRef } from 'react'
import { useCart } from '../context/useCart'
import { formatCents } from '../lib/format'
import { getConfirmationCopy } from '../lib/checkout-copy'
import ResultPanel from './shop/ResultPanel'
import { ButtonLink } from './shop/ui'

interface CheckoutSuccessProps {
  /** Resumo autorizado por token; `null` = sem acesso (mensagem genérica). */
  order: { number: number; paymentStatus: string; totalCents: number } | null
  onlinePayment: boolean
}

// Textos vêm de getConfirmationCopy (Etapa A): nada aqui afirma pagamento,
// confirmação ou baixa de estoque que ainda não aconteceram.
export default function CheckoutSuccess({ order, onlinePayment }: CheckoutSuccessProps) {
  const { clearCart } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if (!cleared.current) {
      cleared.current = true
      clearCart()
    }
  }, [clearCart])

  const copy = getConfirmationCopy({ order, onlinePayment })
  const paid = copy.tone === 'paid'

  return (
    <ResultPanel
      status={paid ? 'Pagamento confirmado' : 'Pedido registrado'}
      tone={paid ? 'success' : 'pending'}
      title={copy.title}
      detail={
        order ? (
          <>
            Pedido nº {order.number} · {formatCents(order.totalCents)}
          </>
        ) : undefined
      }
      actions={<ButtonLink href="/">Voltar à loja</ButtonLink>}
    >
      <p>{copy.body}</p>
      <p className="text-sm text-ink-soft">{copy.footnote}</p>
    </ResultPanel>
  )
}
