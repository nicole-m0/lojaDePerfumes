import Link from 'next/link'
import { AlertCircle, Clock } from 'lucide-react'

// Páginas de retorno do Mercado Pago (falha / pendente). São APENAS UX — não
// alteram o estado do pedido. A verdade do pagamento vem do webhook.

interface CheckoutReturnNoticeProps {
  variant: 'failure' | 'pending'
  orderNumber: number | null
}

const CONTENT = {
  failure: {
    title: 'Pagamento não concluído',
    body: 'O pagamento não foi finalizado no Mercado Pago. Seu pedido continua registrado e aguardando pagamento — você pode tentar de novo pelo carrinho.',
    tone: 'text-red-600',
    bg: 'bg-red-50',
    Icon: AlertCircle,
    cta: { href: '/carrinho', label: 'Voltar ao carrinho' },
  },
  pending: {
    title: 'Pagamento em análise',
    body: 'O Mercado Pago ainda está processando o pagamento (comum em boleto e alguns PIX). Assim que for aprovado, o pedido é confirmado automaticamente — não é preciso pagar de novo.',
    tone: 'text-amber-600',
    bg: 'bg-amber-50',
    Icon: Clock,
    cta: { href: '/', label: 'Voltar à loja' },
  },
} as const

export default function CheckoutReturnNotice({ variant, orderNumber }: CheckoutReturnNoticeProps) {
  const c = CONTENT[variant]
  const { Icon } = c

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-venus-100 bg-white p-8 text-center">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${c.bg}`}>
        <Icon className={`h-7 w-7 ${c.tone}`} />
      </div>

      <h1 className="mt-4 text-xl font-bold text-neutral-800">{c.title}</h1>

      <p className="mt-2 text-sm text-neutral-600">
        {orderNumber != null && (
          <>
            Pedido <span className="font-semibold">#{orderNumber}</span>.{' '}
          </>
        )}
        {c.body}
      </p>

      <Link
        href={c.cta.href}
        className="mt-6 inline-block rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
      >
        {c.cta.label}
      </Link>
    </div>
  )
}
