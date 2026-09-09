'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import {
  createExpenseAction,
  updateExpenseAction,
  type ExpenseFormState,
} from '@/app/(admin)/admin/(dashboard)/financeiro/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Sugestões — não restringem a entrada (categoria é texto livre, ver prisma/schema.prisma).
const CATEGORY_SUGGESTIONS = [
  'Embalagem',
  'Marketing',
  'Aluguel',
  'Taxas e tarifas',
  'Frete/logística',
  'Manutenção',
  'Outros',
]

export interface ExpenseFormValues {
  id?: string
  description: string
  category: string
  amountReais: string
  occurredAt: string
}

export default function ExpenseForm({
  initialValues,
  submitLabel,
}: {
  initialValues: ExpenseFormValues
  submitLabel: string
}) {
  const action = initialValues.id ? updateExpenseAction : createExpenseAction
  const [state, formAction, isPending] = useActionState<ExpenseFormState, FormData>(action, {})

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {initialValues.id && <input type="hidden" name="id" value={initialValues.id} />}

      <div>
        <Label htmlFor="description">Descrição</Label>
        <Input
          id="description"
          name="description"
          defaultValue={initialValues.description}
          required
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="category">Categoria</Label>
        <Input
          id="category"
          name="category"
          list="expense-category-suggestions"
          defaultValue={initialValues.category}
          required
          className="mt-1.5"
        />
        <datalist id="expense-category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="amountReais">Valor (R$)</Label>
          <Input
            id="amountReais"
            name="amountReais"
            defaultValue={initialValues.amountReais}
            inputMode="decimal"
            placeholder="150,00"
            required
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="occurredAt">Data</Label>
          <Input
            id="occurredAt"
            name="occurredAt"
            type="date"
            defaultValue={initialValues.occurredAt}
            required
            className="mt-1.5"
          />
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/financeiro">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}
