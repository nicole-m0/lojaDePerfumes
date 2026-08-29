'use client'

import { useActionState } from 'react'
import {
  updatePaymentStatus,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import { formatCents } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'

const PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PAID', label: 'Pago' },
  { value: 'PARTIALLY_PAID', label: 'Parcialmente pago' },
  { value: 'REFUNDED', label: 'Estornado' },
  { value: 'CHARGEBACK', label: 'Chargeback' },
  { value: 'FAILED', label: 'Falhou' },
  { value: 'CANCELED', label: 'Cancelado' },
]

const selectClass =
  'mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default function PaymentControl({
  orderId,
  payment,
}: {
  orderId: string
  payment: { id: string; method: string; amountCents: number; status: string }
}) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    updatePaymentStatus,
    {},
  )

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentId" value={payment.id} />

      <div className="flex items-center justify-between gap-2">
        <span>
          {payment.method} · <span className="tabular-nums">{formatCents(payment.amountCents)}</span>
        </span>
        <OrderStatusBadge kind="payment" value={payment.status} />
      </div>

      <div>
        <Label htmlFor="payment-status">Novo status do pagamento</Label>
        <select
          id="payment-status"
          name="toStatus"
          defaultValue={payment.status}
          className={selectClass}
        >
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Registro manual — nenhum pagamento é processado. Não altera o status do pedido.
      </p>

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Salvando...' : 'Atualizar pagamento'}
      </Button>

      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
