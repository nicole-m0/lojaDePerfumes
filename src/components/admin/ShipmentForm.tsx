'use client'

import { useActionState } from 'react'
import {
  upsertShipment,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const SHIPMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'PENDING', label: 'Aguardando' },
  { value: 'READY', label: 'Pronto p/ envio' },
  { value: 'IN_TRANSIT', label: 'Em trânsito' },
  { value: 'DELIVERED', label: 'Entregue' },
  { value: 'RETURNED', label: 'Devolvido' },
  { value: 'CANCELED', label: 'Cancelado' },
]

const selectClass =
  'mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

interface ShipmentValue {
  status: string
  carrier: string | null
  trackingCode: string | null
  estimatedAt: Date | null
  shippedAt: Date | null
  deliveredAt: Date | null
  notes: string | null
}

const toDateInput = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : ''

export default function ShipmentForm({
  orderId,
  shipment,
  defaultCarrier = null,
}: {
  orderId: string
  shipment: ShipmentValue | null
  /** Transportadora sugerida pela cotação de frete (Fase 5) — só prefill quando ainda não há entrega. */
  defaultCarrier?: string | null
}) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    upsertShipment,
    {},
  )

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="shipment-status">Status</Label>
          <select
            id="shipment-status"
            name="status"
            defaultValue={shipment?.status ?? 'PENDING'}
            className={selectClass}
          >
            {SHIPMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="shipment-carrier">Transportadora</Label>
          <Input
            id="shipment-carrier"
            name="carrier"
            defaultValue={shipment?.carrier ?? defaultCarrier ?? ''}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="shipment-tracking">Código de rastreio</Label>
          <Input
            id="shipment-tracking"
            name="trackingCode"
            defaultValue={shipment?.trackingCode ?? ''}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="shipment-estimated">Previsão de entrega</Label>
          <Input
            id="shipment-estimated"
            name="estimatedAt"
            type="date"
            defaultValue={toDateInput(shipment?.estimatedAt)}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="shipment-shipped">Enviado em</Label>
          <Input
            id="shipment-shipped"
            name="shippedAt"
            type="date"
            defaultValue={toDateInput(shipment?.shippedAt)}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="shipment-delivered">Entregue em</Label>
          <Input
            id="shipment-delivered"
            name="deliveredAt"
            type="date"
            defaultValue={toDateInput(shipment?.deliveredAt)}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="shipment-notes">Observações</Label>
        <Textarea
          id="shipment-notes"
          name="notes"
          rows={2}
          defaultValue={shipment?.notes ?? ''}
          className="mt-1.5"
        />
      </div>

      <p className="text-xs text-muted-foreground">Não altera estoque nem o status do pedido.</p>

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Salvando...' : shipment ? 'Atualizar entrega' : 'Registrar entrega'}
      </Button>

      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
