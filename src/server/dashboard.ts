import 'server-only'
import { prisma } from '@/lib/prisma'
import { isLowStock } from '@/lib/stock'
import { resolveDateRange, type DateRange, type PeriodPreset } from '@/lib/date-range'
import {
  computeCountsByKey,
  computeDailySeries,
  computePaymentMethodCounts,
  computeRevenueSummary,
  type DashboardOrderInput,
  type DailyMetric,
  type RevenueSummary,
} from '@/lib/dashboard-metrics'

// Métricas do dashboard por período — somente leitura, sem escrita em Order/Payment/Product.
// Mantido separado de `getDashboardCounts` (src/server/catalog.ts), que continua servindo os
// cards de totais gerais do catálogo sem filtro de período.

export interface DashboardMetrics {
  range: DateRange
  orders: {
    total: number
    canceled: number
    canceledRate: number // 0..1
    byStatus: { key: string; count: number }[]
    bySource: { key: string; count: number }[]
  }
  revenue: RevenueSummary & { byMethod: { method: string; count: number }[] }
  stock: {
    totalProducts: number
    lowStockCount: number
    lowStockSample: { id: string; name: string; stockOnHand: number }[]
  }
  daily: DailyMetric[]
}

export async function getDashboardMetrics(preset: PeriodPreset): Promise<DashboardMetrics> {
  const range = resolveDateRange(preset)

  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: {
        status: true,
        source: true,
        paymentStatus: true,
        totalCents: true,
        createdAt: true,
        payments: { orderBy: { createdAt: 'asc' }, take: 1, select: { method: true } },
      },
    }),
    prisma.product.findMany({ select: { id: true, name: true, stockOnHand: true } }),
  ])

  const normalized: DashboardOrderInput[] = orders.map((order) => ({
    status: order.status,
    source: order.source,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    paymentMethod: order.payments[0]?.method ?? null,
  }))

  const byStatus = computeCountsByKey(normalized, 'status')
  const canceled = byStatus.find((s) => s.key === 'CANCELED')?.count ?? 0

  const lowStockProducts = products
    .filter((p) => isLowStock(p.stockOnHand))
    .sort((a, b) => a.stockOnHand - b.stockOnHand)

  return {
    range,
    orders: {
      total: normalized.length,
      canceled,
      canceledRate: normalized.length > 0 ? canceled / normalized.length : 0,
      byStatus,
      bySource: computeCountsByKey(normalized, 'source'),
    },
    revenue: {
      ...computeRevenueSummary(normalized),
      byMethod: computePaymentMethodCounts(normalized),
    },
    stock: {
      totalProducts: products.length,
      lowStockCount: lowStockProducts.length,
      lowStockSample: lowStockProducts.slice(0, 5),
    },
    daily: computeDailySeries(normalized, range),
  }
}
