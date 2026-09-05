'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock } from 'lucide-react'
import { useCart } from '../context/useCart'
import { formatCents } from '../lib/format'

interface CheckoutSuccessProps {
  orderNumber: number | null
  totalCents: number | null
  paymentStatus: string | null
  found: boolean
}

export default function CheckoutSuccess({
  orderNumber,
  totalCents,
  paymentStatus,
  found,
}: CheckoutSuccessProps) {
  const { clearCart } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if (!cleared.current) {
      cleared.current = true
      clearCart()
    }
  }, [clearCart])

  const paid = paymentStatus === 'PAID'

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-venus-100 bg-white p-8 text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          paid ? 'bg-green-50' : 'bg-amber-50'
        }`}
      >
        {paid ? (
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        ) : (
          <Clock className="h-7 w-7 text-amber-600" />
        )}
      </div>

      <h1 className="mt-4 text-xl font-bold text-neutral-800">
        {paid ? 'Pagamento confirmado!' : 'Pedido recebido!'}
      </h1>

      {found && orderNumber != null ? (
        <p className="mt-2 text-sm text-neutral-600">
          Seu pedido <span className="font-semibold">#{orderNumber}</span>{' '}
          {paid ? (
            <>
              está <span className="font-semibold">pago</span> e já entrou em preparação.
            </>
          ) : (
            <>
              foi registrado. Assim que o <span className="font-semibold">Mercado Pago</span>{' '}
              confirmar o pagamento, ele será processado automaticamente.
            </>
          )}
          {totalCents != null && (
            <>
              {' '}
              Total: <span className="font-semibold">{formatCents(totalCents)}</span>.
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          Seu pedido foi registrado. A confirmação do pagamento chega automaticamente pelo
          Mercado Pago.
        </p>
      )}

      <p className="mt-3 text-xs text-neutral-400">
        Você receberá o comprovante e as novidades do pedido pelo contato informado.
      </p>

      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
      >
        Voltar à loja
      </Link>
    </div>
  )
}
