import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getExpense } from '@/server/expenses'
import { centsToReais } from '@/lib/format'
import { toDayKey } from '@/lib/date-range'
import { deleteExpenseAction } from '@/app/(admin)/admin/(dashboard)/financeiro/actions'
import ExpenseForm, { type ExpenseFormValues } from '@/components/admin/ExpenseForm'
import { Button } from '@/components/ui/button'
import { requireStaffPage } from '@/server/guard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Editar despesa' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditExpensePage({ params }: PageProps) {
  await requireStaffPage('finance')
  const { id } = await params
  const expense = await getExpense(id)
  if (!expense) notFound()

  const initialValues: ExpenseFormValues = {
    id: expense.id,
    description: expense.description,
    category: expense.category,
    amountReais: centsToReais(expense.amountCents).toString().replace('.', ','),
    occurredAt: toDayKey(expense.occurredAt),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/financeiro"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Financeiro
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Editar despesa</h1>
        </div>

        <form action={deleteExpenseAction}>
          <input type="hidden" name="id" value={expense.id} />
          <Button type="submit" variant="destructive" size="sm">
            Excluir
          </Button>
        </form>
      </div>

      <ExpenseForm initialValues={initialValues} submitLabel="Salvar alterações" />
    </div>
  )
}
