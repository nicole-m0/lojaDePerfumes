import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import ExpenseForm, { type ExpenseFormValues } from '@/components/admin/ExpenseForm'
import { toDayKey } from '@/lib/date-range'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Nova despesa' }

export default function NewExpensePage() {
  const EMPTY: ExpenseFormValues = {
    description: '',
    category: '',
    amountReais: '',
    occurredAt: toDayKey(new Date()),
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/financeiro"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Financeiro
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Nova despesa</h1>
      </div>

      <ExpenseForm initialValues={EMPTY} submitLabel="Registrar despesa" />
    </div>
  )
}
