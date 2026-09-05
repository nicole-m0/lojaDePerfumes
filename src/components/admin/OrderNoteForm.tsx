'use client'

import { useActionState, useEffect, useRef } from 'react'
import {
  addOrderNote,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export default function OrderNoteForm({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    addOrderNote,
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={formAction} className="space-y-2 text-sm">
      <input type="hidden" name="orderId" value={orderId} />
      <Textarea name="note" rows={2} placeholder="Nota interna (registrada no histórico)" required />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Salvando...' : 'Adicionar nota'}
      </Button>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
