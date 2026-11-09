'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  registerOrderReturn,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PendingLine {
  productId: string
  productName: string
  pending: number
}

/**
 * Registro de retorno físico, por produto. O limite exibido é só orientação: o
 * servidor recalcula o pendente dentro da transação, com o pedido travado.
 */
export default function OrderReturnForm({ orderId, lines }: { orderId: string; lines: PendingLine[] }) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    registerOrderReturn,
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={formAction} className="space-y-2 text-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
        <select
          name="productId"
          required
          className="h-9 rounded-md border bg-background px-2"
          aria-label="Produto devolvido"
        >
          {lines.map((l) => (
            <option key={l.productId} value={l.productId}>
              {l.productName} — {l.pending} pendente(s)
            </option>
          ))}
        </select>
        <Input
          name="quantity"
          type="number"
          min={1}
          step={1}
          defaultValue={1}
          required
          aria-label="Quantidade devolvida"
        />
      </div>
      <Input name="note" placeholder="Observação (opcional)" maxLength={500} />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Registrando...' : 'Registrar retorno físico'}
      </Button>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
