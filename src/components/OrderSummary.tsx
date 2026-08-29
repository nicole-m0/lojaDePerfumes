import { formatCents } from '../lib/format'

interface OrderSummaryProps {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
}

// Valores sempre vêm do servidor (getCartPricing) — nunca calculados no cliente.
export default function OrderSummary({
  subtotalCents,
  discountCents,
  shippingCents,
  totalCents,
}: OrderSummaryProps) {
  return (
    <dl className="space-y-1.5 text-sm text-neutral-600">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd className="tabular-nums">{formatCents(subtotalCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Desconto</dt>
        <dd className="tabular-nums">
          {discountCents > 0 ? `- ${formatCents(discountCents)}` : formatCents(0)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt>Frete</dt>
        <dd className="tabular-nums">
          {shippingCents > 0 ? formatCents(shippingCents) : 'a combinar'}
        </dd>
      </div>
      <div className="flex justify-between border-t border-venus-100 pt-2 text-base font-bold text-venus-700">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatCents(totalCents)}</dd>
      </div>
    </dl>
  )
}
