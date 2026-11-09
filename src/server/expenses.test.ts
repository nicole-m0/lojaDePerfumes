import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock leve do Prisma — Expense é CRUD simples (sem transação/lock), então não precisa
// do fake-prisma compartilhado (src/test/fake-prisma.ts), que modela Order/Payment/OrderEvent.

vi.mock('server-only', () => ({}))

interface Row {
  [k: string]: unknown
}

const h = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    expense: {
      async create({ data }: { data: Row }) {
        const row: Row = { id: `exp_${++h.seq}`, createdAt: new Date(), updatedAt: new Date(), ...data }
        h.rows.push(row)
        return { ...row }
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const row = h.rows.find((r) => r.id === where.id)
        if (!row) throw new Error('not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return { ...row }
      },
      async delete({ where }: { where: { id: string } }) {
        const index = h.rows.findIndex((r) => r.id === where.id)
        if (index === -1) throw new Error('not found')
        const [removed] = h.rows.splice(index, 1)
        return removed
      },
      async findUnique({ where }: { where: { id: string } }) {
        return h.rows.find((r) => r.id === where.id) ?? null
      },
      async findMany({ where }: { where?: { occurredAt?: { gte: Date; lte: Date } } } = {}) {
        let result = [...h.rows]
        if (where?.occurredAt) {
          const { gte, lte } = where.occurredAt
          result = result.filter((r) => {
            const d = r.occurredAt as Date
            return d >= gte && d <= lte
          })
        }
        return result.sort(
          (a, b) => (b.occurredAt as Date).getTime() - (a.occurredAt as Date).getTime(),
        )
      },
    },
  },
}))

// Import AFTER the mocks are registered.
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  ExpenseServiceError,
} from '@/server/expenses'

beforeEach(() => {
  h.rows = []
  h.seq = 0
})

function input(overrides: Partial<Parameters<typeof createExpense>[0]> = {}) {
  return {
    description: 'Caixas de papelão',
    category: 'Embalagem',
    amountCents: 5000,
    occurredAt: new Date(2026, 8, 1),
    ...overrides,
  }
}

describe('createExpense', () => {
  it('cria uma despesa válida', async () => {
    const created = await createExpense(input())
    expect(created.description).toBe('Caixas de papelão')
    expect(created.category).toBe('Embalagem')
    expect(created.amountCents).toBe(5000)
  })

  it('rejeita valor zero', async () => {
    await expect(createExpense(input({ amountCents: 0 }))).rejects.toBeInstanceOf(
      ExpenseServiceError,
    )
  })

  it('rejeita valor negativo', async () => {
    await expect(createExpense(input({ amountCents: -100 }))).rejects.toBeInstanceOf(
      ExpenseServiceError,
    )
  })

  it('rejeita descrição vazia', async () => {
    await expect(createExpense(input({ description: '   ' }))).rejects.toBeInstanceOf(
      ExpenseServiceError,
    )
  })

  it('rejeita categoria vazia', async () => {
    await expect(createExpense(input({ category: '' }))).rejects.toBeInstanceOf(
      ExpenseServiceError,
    )
  })
})

describe('updateExpense', () => {
  it('edita uma despesa existente', async () => {
    const created = await createExpense(input())
    const updated = await updateExpense(created.id as string, input({ amountCents: 7500 }))
    expect(updated.amountCents).toBe(7500)

    const fetched = await getExpense(created.id as string)
    expect(fetched?.amountCents).toBe(7500)
  })

  it('rejeita edição para valor <= 0', async () => {
    const created = await createExpense(input())
    await expect(
      updateExpense(created.id as string, input({ amountCents: 0 })),
    ).rejects.toBeInstanceOf(ExpenseServiceError)
  })

  it('lança erro ao editar despesa inexistente', async () => {
    await expect(updateExpense('nope', input())).rejects.toBeInstanceOf(ExpenseServiceError)
  })
})

describe('deleteExpense', () => {
  it('exclui uma despesa existente', async () => {
    const created = await createExpense(input())
    await deleteExpense(created.id as string)
    expect(await getExpense(created.id as string)).toBeNull()
  })

  it('lança erro ao excluir despesa inexistente', async () => {
    await expect(deleteExpense('nope')).rejects.toBeInstanceOf(ExpenseServiceError)
  })
})

describe('listExpenses', () => {
  it('filtra despesas pelo intervalo de occurredAt', async () => {
    await createExpense(input({ occurredAt: new Date(2026, 7, 1) })) // fora do range
    await createExpense(input({ occurredAt: new Date(2026, 8, 5) })) // dentro
    await createExpense(input({ occurredAt: new Date(2026, 8, 10) })) // dentro

    const result = await listExpenses({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) })
    expect(result).toHaveLength(2)
  })
})
