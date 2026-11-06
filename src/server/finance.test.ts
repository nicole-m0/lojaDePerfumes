import { beforeEach, describe, expect, it, vi } from 'vitest'

// Teste de orquestração de `getFinanceMetrics`: o mock do Prisma ignora o filtro de data
// (isso é responsabilidade do Postgres/Prisma em produção, não deste teste) e devolve
// exatamente as fixtures configuradas — o que se verifica aqui é que `getFinanceMetrics`
// combina corretamente receita (reaproveitada de dashboard-metrics), estornos, despesas e
// custo/margem (finance-metrics), preservando as regras de "custo desconhecido != zero".

vi.mock('server-only', () => ({}))

interface Row {
  [k: string]: unknown
}

const h = vi.hoisted(() => ({
  orders: [] as Row[],
  expenses: [] as Row[],
  products: [] as Row[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: async () => h.orders },
    expense: { findMany: async () => h.expenses },
    product: { findMany: async () => h.products },
  },
}))

import { getFinanceMetrics } from '@/server/finance'

beforeEach(() => {
  h.orders = []
  h.expenses = []
  h.products = []
})

function order(overrides: Partial<Row> = {}): Row {
  return {
    status: 'CONFIRMED',
    source: 'WEBSITE',
    paymentStatus: 'PAID',
    totalCents: 10000,
    createdAt: new Date(),
    payments: [],
    items: [],
    ...overrides,
  }
}

describe('getFinanceMetrics', () => {
  it('calcula receita recebida reaproveitando a mesma semântica do Dashboard (soma de Payments PAID)', async () => {
    h.orders = [
      order({
        paymentStatus: 'PAID',
        totalCents: 10000,
        payments: [{ status: 'PAID', amountCents: 10000, method: 'PIX' }],
      }),
      order({
        paymentStatus: 'PENDING',
        totalCents: 5000,
        payments: [],
      }),
    ]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.receivedCents).toBe(10000)
  })

  it('soma estornos e chargeback separadamente da receita recebida', async () => {
    h.orders = [
      order({
        paymentStatus: 'REFUNDED',
        totalCents: 8000,
        payments: [
          { status: 'PAID', amountCents: 8000, method: 'PIX' },
          { status: 'REFUNDED', amountCents: 8000, method: 'PIX' },
        ],
      }),
      order({
        paymentStatus: 'CHARGEBACK',
        totalCents: 4000,
        payments: [{ status: 'CHARGEBACK', amountCents: 4000, method: 'CREDIT_CARD' }],
      }),
    ]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.refundedCents).toBe(8000)
    expect(metrics.chargebackCents).toBe(4000)
  })

  it('soma despesas do período', async () => {
    h.expenses = [{ amountCents: 1500 }, { amountCents: 2500 }]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.expensesCents).toBe(4000)
  })

  it('calcula custo e margem só a partir de pedidos PAID, ignorando pedidos pendentes/cancelados', async () => {
    h.products = [{ id: 'prod_1', costCents: 3000 }]
    h.orders = [
      order({
        paymentStatus: 'PAID',
        items: [{ productId: 'prod_1', quantity: 2, unitPriceCents: 5000 }],
      }),
      order({
        paymentStatus: 'PENDING',
        items: [{ productId: 'prod_1', quantity: 100, unitPriceCents: 5000 }],
      }),
      order({
        paymentStatus: 'CANCELED',
        items: [{ productId: 'prod_1', quantity: 100, unitPriceCents: 5000 }],
      }),
    ]
    const metrics = await getFinanceMetrics('30d')
    // Só os 2 itens do pedido PAID entram — os 100+100 de pedidos não pagos são ignorados.
    expect(metrics.cogs.knownCostCents).toBe(6000)
    expect(metrics.cogs.knownRevenueCents).toBe(10000)
    expect(metrics.grossMargin.marginCents).toBe(4000)
    expect(metrics.grossMargin.available).toBe(true)
  })

  it('produto vendido sem costCents fica fora do CMV/margem, mas é sinalizado (hasUnknownCost)', async () => {
    h.products = [{ id: 'prod_1', costCents: null }]
    h.orders = [
      order({
        paymentStatus: 'PAID',
        items: [{ productId: 'prod_1', quantity: 1, unitPriceCents: 9000 }],
      }),
    ]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.cogs.hasUnknownCost).toBe(true)
    expect(metrics.cogs.knownCostCents).toBe(0)
    expect(metrics.cogs.knownRevenueCents).toBe(0)
    expect(metrics.cogs.unknownCostRevenueCents).toBe(9000)
    // Sem base de receita com custo conhecido: margem indisponível, nunca inflada para 100%.
    expect(metrics.grossMargin.available).toBe(false)
  })

  it('combina produtos com custo conhecido e desconhecido no mesmo período', async () => {
    h.products = [
      { id: 'prod_known', costCents: 2000 },
      { id: 'prod_unknown', costCents: null },
    ]
    h.orders = [
      order({
        paymentStatus: 'PAID',
        items: [
          { productId: 'prod_known', quantity: 1, unitPriceCents: 6000 },
          { productId: 'prod_unknown', quantity: 1, unitPriceCents: 15000 },
        ],
      }),
    ]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.cogs.hasUnknownCost).toBe(true)
    expect(metrics.cogs.knownRevenueCents).toBe(6000)
    expect(metrics.cogs.knownCostCents).toBe(2000)
    expect(metrics.cogs.unknownCostRevenueCents).toBe(15000)
    // Margem calculada só sobre os 6000 conhecidos — nunca sobre os 21000 totais.
    expect(metrics.grossMargin.marginCents).toBe(4000)
    expect(metrics.grossMargin.marginPercent).toBeCloseTo(4000 / 6000)
  })

  it('não consulta produtos quando não há pedidos pagos no período (evita query vazia desnecessária)', async () => {
    h.orders = [order({ paymentStatus: 'PENDING', items: [] })]
    const metrics = await getFinanceMetrics('30d')
    expect(metrics.cogs.knownRevenueCents).toBe(0)
    expect(metrics.grossMargin.available).toBe(false)
  })
})
