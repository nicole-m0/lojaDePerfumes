'use client'

import { useActionState } from 'react'
import {
  adjustStockQuantity,
  registerStockEntry,
  registerStockExit,
  type StockActionState,
} from '@/app/(admin)/admin/(dashboard)/estoque/[productId]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const selectClass =
  'mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

function ActionError({ state }: { state: StockActionState }) {
  if (!state.error) return null
  return (
    <p className="text-sm text-destructive" role="alert">
      {state.error}
    </p>
  )
}

export function StockEntryForm({ productId }: { productId: string }) {
  const [state, formAction, isPending] = useActionState<StockActionState, FormData>(
    registerStockEntry,
    {},
  )

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <Label htmlFor="entry-reason">Motivo</Label>
        <select id="entry-reason" name="reason" defaultValue="PURCHASE" className={selectClass}>
          <option value="PURCHASE">Compra / reposição</option>
          <option value="CUSTOMER_RETURN">Devolução de cliente</option>
          <option value="INVENTORY_COUNT">Contagem de inventário</option>
          <option value="OTHER">Outro</option>
        </select>
      </div>

      <div>
        <Label htmlFor="entry-quantity">Quantidade</Label>
        <Input id="entry-quantity" name="quantity" type="number" min={1} step={1} required className="mt-1.5" />
      </div>

      <div>
        <Label htmlFor="entry-note">Observação (opcional)</Label>
        <Textarea id="entry-note" name="note" rows={2} className="mt-1.5" />
      </div>

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Registrando...' : 'Registrar entrada'}
      </Button>

      <ActionError state={state} />
    </form>
  )
}

export function StockExitForm({ productId }: { productId: string }) {
  const [state, formAction, isPending] = useActionState<StockActionState, FormData>(
    registerStockExit,
    {},
  )

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <Label htmlFor="exit-reason">Motivo</Label>
        <select id="exit-reason" name="reason" defaultValue="LOSS" className={selectClass}>
          <option value="LOSS">Perda / quebra</option>
          <option value="OTHER">Outro</option>
        </select>
      </div>

      <div>
        <Label htmlFor="exit-quantity">Quantidade</Label>
        <Input id="exit-quantity" name="quantity" type="number" min={1} step={1} required className="mt-1.5" />
      </div>

      <div>
        <Label htmlFor="exit-note">Observação (opcional)</Label>
        <Textarea id="exit-note" name="note" rows={2} className="mt-1.5" />
      </div>

      <p className="text-xs text-muted-foreground">Bloqueada se a quantidade for maior que o saldo atual.</p>

      <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
        {isPending ? 'Registrando...' : 'Registrar saída'}
      </Button>

      <ActionError state={state} />
    </form>
  )
}

export function StockAdjustmentForm({
  productId,
  currentStock,
}: {
  productId: string
  currentStock: number
}) {
  const [state, formAction, isPending] = useActionState<StockActionState, FormData>(
    adjustStockQuantity,
    {},
  )

  return (
    <form action={formAction} className="space-y-3 text-sm">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <Label htmlFor="adjust-reason">Motivo</Label>
        <select id="adjust-reason" name="reason" defaultValue="INVENTORY_COUNT" className={selectClass}>
          <option value="INVENTORY_COUNT">Contagem de inventário</option>
          <option value="MANUAL_ADJUSTMENT">Ajuste manual</option>
        </select>
      </div>

      <div>
        <Label htmlFor="adjust-quantity">Novo saldo (atual: {currentStock})</Label>
        <Input
          id="adjust-quantity"
          name="newQuantity"
          type="number"
          min={0}
          step={1}
          defaultValue={currentStock}
          required
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="adjust-note">Observação (opcional)</Label>
        <Textarea id="adjust-note" name="note" rows={2} className="mt-1.5" />
      </div>

      <p className="text-xs text-muted-foreground">
        Informe o saldo real contado — o sistema calcula e registra a diferença.
      </p>

      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? 'Ajustando...' : 'Ajustar saldo'}
      </Button>

      <ActionError state={state} />
    </form>
  )
}
