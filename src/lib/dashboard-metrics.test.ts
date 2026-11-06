import { describe, expect, it } from 'vitest'
import { resolveDateRange } from './date-range'
import {
  computeCountsByKey,
  computeDailySeries,
  computePaymentMethodCounts,
  computeRevenueSummary,
  type DashboardOrderInput,
} from './dashboard-metrics'

const FIXED_NOW = new Date(2026, 7, 30, 12, 0, 0)

function order(overrides: Partial<DashboardOrderInput>): DashboardOrderInput {
  return {
    status: 'PENDING',
    source: 'WEBSITE',
    paymentStatus: 'PENDING',
    totalCents: 1000,
    createdAt: FIXED_NOW,
    paymentMethod: null,
    paidCents: 0,
    ...overrides,
  }
}

describe('computeCountsByKey', () => {
  it('conta por status em ordem decrescente', () => {
    const orders = [
      order({ status: 'CONFIRMED' }),
      order({ status: 'PENDING' }),
      order({ status: 'CONFIRMED' }),
    ]
    expect(computeCountsByKey(orders, 'status')).toEqual([
      { key: 'CONFIRMED', count: 2 },
      { key: 'PENDING', count: 1 },
    ])
  })

  it('retorna vazio para lista vazia', () => {
    expect(computeCountsByKey([], 'source')).toEqual([])
  })
})

describe('computeRevenueSummary', () => {
  it('soma o valor efetivamente pago (paidCents) de pedidos totalmente quitados', () => {
    const orders = [
      order({ paymentStatus: 'PAID', totalCents: 5000, paidCents: 5000 }),
      order({ paymentStatus: 'PAID', totalCents: 3000, paidCents: 3000 }),
      order({ paymentStatus: 'PENDING', totalCents: 1000, paidCents: 0 }),
      order({ paymentStatus: 'PARTIALLY_PAID', totalCents: 2000, paidCents: 0 }),
      order({ paymentStatus: 'CANCELED', totalCents: 9999, paidCents: 0 }),
    ]
    const summary = computeRevenueSummary(orders)
    expect(summary.paidTotalCents).toBe(8000)
    expect(summary.paidOrderCount).toBe(2)
    expect(summary.averageTicketCents).toBe(4000)
    expect(summary.pendingTotalCents).toBe(3000)
  })

  it('pedido PARTIALLY_PAID soma o valor já recebido em paidTotalCents e só o saldo em pendingTotalCents', () => {
    // Pedido de R$ 20 com R$ 8 já pagos (múltiplos Payments, Parte 8): entram 800 centavos
    // no faturamento recebido e só os 1200 restantes em "a receber" — nunca o total 2000.
    const orders = [order({ paymentStatus: 'PARTIALLY_PAID', totalCents: 2000, paidCents: 800 })]
    const summary = computeRevenueSummary(orders)
    expect(summary.paidTotalCents).toBe(800)
    expect(summary.paidOrderCount).toBe(0)
    expect(summary.pendingTotalCents).toBe(1200)
  })

  it('não divide por zero quando não há pedido pago', () => {
    const summary = computeRevenueSummary([order({ paymentStatus: 'PENDING' })])
    expect(summary.paidOrderCount).toBe(0)
    expect(summary.averageTicketCents).toBe(0)
  })
})

describe('computePaymentMethodCounts', () => {
  it('conta 1 por pedido pago, mesmo que o pedido tenha método definido', () => {
    const orders = [
      order({ paymentStatus: 'PAID', paymentMethod: 'PIX' }),
      order({ paymentStatus: 'PAID', paymentMethod: 'PIX' }),
      order({ paymentStatus: 'PAID', paymentMethod: 'BOLETO' }),
      order({ paymentStatus: 'PENDING', paymentMethod: 'PIX' }), // não pago — não conta
    ]
    expect(computePaymentMethodCounts(orders)).toEqual([
      { method: 'PIX', count: 2 },
      { method: 'BOLETO', count: 1 },
    ])
  })
})

describe('computeDailySeries', () => {
  it('bucketiza pedidos por dia, com todos os dias do intervalo presentes', () => {
    const range = resolveDateRange('today', FIXED_NOW)
    const orders = [
      order({ createdAt: FIXED_NOW, paymentStatus: 'PAID', totalCents: 1000, paidCents: 1000 }),
      order({ createdAt: FIXED_NOW, paymentStatus: 'PENDING', totalCents: 500, paidCents: 0 }),
    ]
    const series = computeDailySeries(orders, range)
    expect(series).toEqual([{ date: '2026-08-30', orders: 2, paidRevenueCents: 1000 }])
  })

  it('soma pagamentos parciais no dia, não só pedidos totalmente pagos', () => {
    const range = resolveDateRange('today', FIXED_NOW)
    const orders = [
      order({ createdAt: FIXED_NOW, paymentStatus: 'PARTIALLY_PAID', totalCents: 2000, paidCents: 700 }),
    ]
    const series = computeDailySeries(orders, range)
    expect(series[0].paidRevenueCents).toBe(700)
  })

  it('inclui dias sem nenhum pedido como zero', () => {
    const range = resolveDateRange('7d', FIXED_NOW)
    const series = computeDailySeries([], range)
    expect(series).toHaveLength(7)
    expect(series.every((d) => d.orders === 0 && d.paidRevenueCents === 0)).toBe(true)
  })
})
