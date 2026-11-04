import { formatCents } from '../lib/format'

interface OrderSummaryProps {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  /** Texto do frete enquanto não há valor (ex.: "calculado no checkout"). */
  shippingPendingLabel?: string
}

// Valores sempre vêm do servidor (getCartPricing) — nunca calculados no cliente.
export default function OrderSummary({
  subtotalCents,
  discountCents,
  shippingCents,
  totalCents,
  shippingPendingLabel = 'a calcular',
}: OrderSummaryProps) {
  return (
    <dl className="text-sm text-ink">
      <div className="flex justify-between py-1.5">
        <dt className="text-ink-soft">Subtotal</dt>
        <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
      </div>
      {discountCents > 0 && (
        <div className="flex justify-between py-1.5">
          <dt className="text-ink-soft">Desconto</dt>
          <dd className="tabular-nums">- {formatCents(discountCents)}</dd>
        </div>
      )}
      <div className="flex justify-between py-1.5">
        <dt className="text-ink-soft">Frete</dt>
        <dd className="tabular-nums">
          {shippingCents > 0 ? formatCents(shippingCents) : shippingPendingLabel}
        </dd>
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-hairline pt-4">
        <dt className="font-medium">Total</dt>
        <dd className="font-display text-3xl font-medium lining-nums tabular-nums">
          {formatCents(totalCents)}
        </dd>
      </div>
    </dl>
  )
}
