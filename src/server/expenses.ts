import 'server-only'
import { prisma } from '@/lib/prisma'
import type { DateRange } from '@/lib/date-range'

// Serviço de despesas operacionais (Fase 6 — financeiro básico). CRUD simples, sem
// máquina de estados: a única regra de negócio é `amountCents` sempre > 0 (nunca
// zero nem negativo) — validada aqui, não confiando na camada de formulário.
// Sem audit trail dedicado (ver comentário em prisma/schema.prisma): mesmo
// tratamento de Category/Brand/Product, que também não têm log de eventos.

/** Erro esperado de validação/negócio — vira mensagem segura para a UI. */
export class ExpenseServiceError extends Error {}

export interface ExpenseInput {
  description: string
  category: string
  amountCents: number
  occurredAt: Date
}

function validate(input: ExpenseInput): void {
  if (!input.description.trim()) {
    throw new ExpenseServiceError('Informe a descrição da despesa.')
  }
  if (!input.category.trim()) {
    throw new ExpenseServiceError('Informe a categoria da despesa.')
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new ExpenseServiceError('O valor da despesa deve ser maior que zero.')
  }
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new ExpenseServiceError('Data da despesa inválida.')
  }
}

export async function createExpense(input: ExpenseInput) {
  validate(input)
  return prisma.expense.create({ data: input })
}

export async function updateExpense(id: string, input: ExpenseInput) {
  validate(input)
  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new ExpenseServiceError('Despesa não encontrada.')
  return prisma.expense.update({ where: { id }, data: input })
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new ExpenseServiceError('Despesa não encontrada.')
  await prisma.expense.delete({ where: { id } })
}

export async function getExpense(id: string) {
  return prisma.expense.findUnique({ where: { id } })
}

export async function listExpenses(range: DateRange) {
  return prisma.expense.findMany({
    where: { occurredAt: { gte: range.from, lte: range.to } },
    orderBy: { occurredAt: 'desc' },
  })
}
