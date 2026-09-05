'use client'

import { useActionState, useState } from 'react'
import {
  updateOrderStatus,
  cancelOrder,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import {
  ORDER_STATUS_LABEL,
  canCancel,
  forwardStatuses,
  type OrderStatusValue,
} from '@/lib/order-status'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function OrderStatusControl({
  orderId,
  status,
}: {
  orderId: string
  status: OrderStatusValue
}) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    updateOrderStatus,
    {},
  )
  const [cancelState, cancelAction, cancelPending] = useActionState<OrderActionState, FormData>(
    cancelOrder,
    {},
  )
  const [showCancel, setShowCancel] = useState(false)

  const forward = forwardStatuses(status)

  return (
    <div className="space-y-3">
      {forward.length === 0 && status !== 'CANCELED' && (
        <p className="text-sm text-muted-foreground">Sem avanço de status disponível.</p>
      )}

      {forward.length > 0 && (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <div>
            <Label htmlFor="status-note">Observação (opcional)</Label>
            <Textarea id="status-note" name="note" rows={2} className="mt-1.5" />
          </div>
          <div className="flex flex-wrap gap-2">
            {forward.map((next) => (
              <Button
                key={next}
                type="submit"
                name="toStatus"
                value={next}
                size="sm"
                disabled={isPending}
              >
                Avançar para “{ORDER_STATUS_LABEL[next]}”
              </Button>
            ))}
          </div>
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </form>
      )}

      {canCancel(status) && (
        <div className="border-t pt-3">
          {!showCancel ? (
            <Button variant="outline" size="sm" onClick={() => setShowCancel(true)}>
              Cancelar pedido
            </Button>
          ) : (
            <form action={cancelAction} className="space-y-2">
              <input type="hidden" name="orderId" value={orderId} />
              <div>
                <Label htmlFor="cancel-reason">Motivo do cancelamento</Label>
                <Textarea id="cancel-reason" name="reason" rows={2} required className="mt-1.5" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" size="sm" disabled={cancelPending}>
                  Confirmar cancelamento
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCancel(false)}
                >
                  Voltar
                </Button>
              </div>
              {cancelState.error && (
                <p className="text-sm text-destructive" role="alert">
                  {cancelState.error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  )
}
