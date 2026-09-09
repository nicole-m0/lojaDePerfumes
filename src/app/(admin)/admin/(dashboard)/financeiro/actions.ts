'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { reaisToCents } from '@/lib/format'
import { requireStaff } from '@/server/guard'
import {
  createExpense,
  updateExpense,
  deleteExpense,
  ExpenseServiceError,
} from '@/server/expenses'

// Wrapper fino sobre src/server/expenses.ts: só faz parsing/validação de FormData e
// tradução de ExpenseServiceError em mensagem de UI. Toda regra de negócio (valor > 0,
// campos obrigatórios) vive no serviço — mesmo padrão de pedidos/[id]/actions.ts sobre
// src/server/payments.ts.

export type ExpenseFormState = { error?: string }

const expenseSchema = z.object({
  description: z.string().trim().min(2, 'Informe uma descrição com ao menos 2 caracteres.'),
  category: z.string().trim().min(1, 'Informe a categoria.'),
  amountReais: z.string().trim().min(1, 'Informe o valor.'),
  occurredAt: z.string().trim().min(1, 'Informe a data.'),
})

function parseForm(formData: FormData): { data?: z.infer<typeof expenseSchema>; error?: string } {
  const parsed = expenseSchema.safeParse({
    description: formData.get('description'),
    category: formData.get('category'),
    amountReais: formData.get('amountReais'),
    occurredAt: formData.get('occurredAt'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  return { data: parsed.data }
}

/** `occurredAt` chega como "YYYY-MM-DD" (input type=date) — meio-dia evita drift de fuso ao converter. */
function toOccurredAt(value: string): Date {
  return new Date(`${value}T12:00:00`)
}

export async function createExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  await requireStaff()
  const { data, error } = parseForm(formData)
  if (!data) return { error }

  try {
    await createExpense({
      description: data.description,
      category: data.category,
      amountCents: reaisToCents(data.amountReais),
      occurredAt: toOccurredAt(data.occurredAt),
    })
  } catch (err) {
    if (err instanceof ExpenseServiceError) return { error: err.message }
    console.error('[createExpenseAction]', err)
    return { error: 'Não foi possível registrar a despesa.' }
  }

  revalidatePath('/admin/financeiro')
  redirect('/admin/financeiro')
}

export async function updateExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  await requireStaff()
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Despesa não encontrada.' }

  const { data, error } = parseForm(formData)
  if (!data) return { error }

  try {
    await updateExpense(id, {
      description: data.description,
      category: data.category,
      amountCents: reaisToCents(data.amountReais),
      occurredAt: toOccurredAt(data.occurredAt),
    })
  } catch (err) {
    if (err instanceof ExpenseServiceError) return { error: err.message }
    console.error('[updateExpenseAction]', err)
    return { error: 'Não foi possível salvar a despesa.' }
  }

  revalidatePath('/admin/financeiro')
  redirect('/admin/financeiro')
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  await requireStaff()
  const id = formData.get('id')
  if (typeof id !== 'string' || !id) return

  // Sem try/catch em volta de `redirect()` (lança um sinal de controle do Next.js — não é
  // um erro a capturar). Se a despesa não existir mais, deleteExpense já lança
  // ExpenseServiceError antes de chegar aqui; deixa subir (mesmo padrão de deleteProduct).
  await deleteExpense(id)

  revalidatePath('/admin/financeiro')
  redirect('/admin/financeiro')
}
