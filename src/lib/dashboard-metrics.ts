// Agregações puras do dashboard — recebem dados já buscados do banco (src/server/dashboard.ts)
// e calculam os números exibidos. Sem Prisma aqui: só transformação de dados, testável isolado.

import { enumerateDays, toDayKey, type DateRange } from './date-range'

export interface DashboardOrderInput {
  status: string
  source: string
  paymentStatus: string
  totalCents: number
  createdAt: Date
  /** Método do primeiro pagamento do pedido, se houver — nunca soma valor por método (ver computeRevenueSummary). */
  paymentMethod: string | null
}

export function computeCountsByKey(
  orders: DashboardOrderInput[],
  key: 'status' | 'source',
): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const order of orders) {
    const value = order[key]
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export interface RevenueSummary {
  paidTotalCents: number
  paidOrderCount: number
  averageTicketCents: number
  pendingTotalCents: number
}

// Soma SEMPRE Order.totalCents (nunca Payment.amountCents) — cada Order entra uma única vez
// no total, então múltiplos Payment futuros por pedido não podem duplicar receita aqui.
export function computeRevenueSummary(orders: DashboardOrderInput[]): RevenueSummary {
  let paidTotalCents = 0
  let paidOrderCount = 0
  let pendingTotalCents = 0

  for (const order of orders) {
    if (order.paymentStatus === 'PAID') {
      paidTotalCents += order.totalCents
      paidOrderCount += 1
    } else if (order.paymentStatus === 'PENDING' || order.paymentStatus === 'PARTIALLY_PAID') {
      pendingTotalCents += order.totalCents
    }
  }

  return {
    paidTotalCents,
    paidOrderCount,
    averageTicketCents: paidOrderCount > 0 ? Math.round(paidTotalCents / paidOrderCount) : 0,
    pendingTotalCents,
  }
}

// Conta pedidos pagos por método (1 pedido = 1 contagem, mesmo que ganhe múltiplos Payments no futuro).
export function computePaymentMethodCounts(
  orders: DashboardOrderInput[],
): { method: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const order of orders) {
    if (order.paymentStatus !== 'PAID' || !order.paymentMethod) continue
    counts.set(order.paymentMethod, (counts.get(order.paymentMethod) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count)
}

export interface DailyMetric {
  date: string
  orders: number
  paidRevenueCents: number
}

export function computeDailySeries(orders: DashboardOrderInput[], range: DateRange): DailyMetric[] {
  const byDay = new Map<string, DailyMetric>()
  for (const day of enumerateDays(range)) {
    byDay.set(day, { date: day, orders: 0, paidRevenueCents: 0 })
  }

  for (const order of orders) {
    const key = toDayKey(order.createdAt)
    const bucket = byDay.get(key)
    if (!bucket) continue // fora do intervalo enumerado (não deveria ocorrer, dado o filtro na query)
    bucket.orders += 1
    if (order.paymentStatus === 'PAID') bucket.paidRevenueCents += order.totalCents
  }

  return [...byDay.values()]
}
