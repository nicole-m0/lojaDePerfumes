import { beforeEach, describe, expect, it, vi } from 'vitest'

// getDashboardMetrics: sem a permissão `finance` (STAFF), os valores pagos nem são
// lidos do banco e o faturamento volta `null`.

const h = vi.hoisted(() => ({ orderFindMany: vi.fn(), productFindMany: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: h.orderFindMany },
    product: { findMany: h.productFindMany },
  },
}))

import { getDashboardMetrics } from '@/server/dashboard'

const now = new Date()
const ORDERS = [
  {
    status: 'CONFIRMED',
    source: 'WEBSITE',
    paymentStatus: 'PAID',
    totalCents: 15000,
    createdAt: now,
    payments: [{ method: 'PIX', status: 'PAID', amountCents: 15000 }],
  },
  {
    status: 'PENDING',
    source: 'WEBSITE',
    paymentStatus: 'PENDING',
    totalCents: 8000,
    createdAt: now,
    payments: [{ method: 'BOLETO', status: 'PENDING', amountCents: 8000 }],
  },
]

beforeEach(() => {
  h.orderFindMany.mockReset()
  h.productFindMany.mockReset()
  // Simula o Prisma: só devolve `payments` quando eles foram pedidos no select.
  h.orderFindMany.mockImplementation(async ({ select }: { select: { payments: unknown } }) =>
    ORDERS.map(({ payments, ...o }) => (select.payments ? { ...o, payments } : o)),
  )
  h.productFindMany.mockResolvedValue([{ id: 'p1', name: 'A', stockOnHand: 0 }])
})

describe('getDashboardMetrics', () => {
  it('sem finance (STAFF): não lê pagamentos e não devolve faturamento', async () => {
    const m = await getDashboardMetrics('30d', { includeFinancials: false })
    const query = h.orderFindMany.mock.calls[0][0]
    expect(query.select.payments).toBe(false)
    expect(m.revenue).toBeNull()
    expect(m.daily.every((d) => d.paidRevenueCents === 0)).toBe(true)
    // O operacional continua: pedidos e estoque.
    expect(m.orders.total).toBe(2)
    expect(m.stock.lowStockCount).toBe(1)
  })

  it('com finance (OWNER/ADMIN): calcula o faturamento', async () => {
    const m = await getDashboardMetrics('30d', { includeFinancials: true })
    expect(h.orderFindMany.mock.calls[0][0].select.payments).toBeTruthy()
    expect(m.revenue).not.toBeNull()
    expect(m.revenue!.paidTotalCents).toBe(15000)
  })
})
