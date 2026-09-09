import 'server-only'
import { prisma } from '@/lib/prisma'
import { resolveDateRange, type DateRange, type PeriodPreset } from '@/lib/date-range'
import { computeRevenueSummary, type DashboardOrderInput } from '@/lib/dashboard-metrics'
import {
  computeRefundTotals,
  computeExpenseTotal,
  computeCogsSummary,
  computeGrossMargin,
  type CogsItemInput,
  type CogsSummary,
  type GrossMargin,
} from '@/lib/finance-metrics'

// Métricas do financeiro básico (Fase 6) por período — somente leitura.
//
// "Receita recebida" reaproveita `computeRevenueSummary` (mesma função e mesma semântica
// do Dashboard: dinheiro efetivamente pago via Payment, nunca Order.totalCents de pedidos
// não quitados) — não há uma segunda lógica de receita.
//
// CMV/margem bruta usam apenas pedidos com paymentStatus PAID no período (mesmo critério
// de `averageTicketCents` em dashboard-metrics.ts): custo de itens de pedidos ainda não
// pagos/pendentes/cancelados não é contabilizado como "custo do vendido".
//
// Estornos somam TODOS os Payments REFUNDED/CHARGEBACK dos pedidos CRIADOS no período,
// independente do paymentStatus atual do pedido — mesma janela de pedidos usada pelo
// Dashboard (filtro por Order.createdAt), não pela data do estorno em si.

export interface FinanceMetrics {
  range: DateRange
  receivedCents: number
  refundedCents: number
  chargebackCents: number
  expensesCents: number
  cogs: CogsSummary
  grossMargin: GrossMargin
}

export async function getFinanceMetrics(preset: PeriodPreset): Promise<FinanceMetrics> {
  const range = resolveDateRange(preset)

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: {
        status: true,
        source: true,
        paymentStatus: true,
        totalCents: true,
        createdAt: true,
        payments: {
          orderBy: { createdAt: 'asc' },
          select: { method: true, status: true, amountCents: true },
        },
        items: { select: { productId: true, quantity: true, unitPriceCents: true } },
      },
    }),
    prisma.expense.findMany({
      where: { occurredAt: { gte: range.from, lte: range.to } },
      select: { amountCents: true },
    }),
  ])

  // --- Receita recebida: reaproveita a agregação já testada do Dashboard. -------------
  const normalized: DashboardOrderInput[] = orders.map((order) => ({
    status: order.status,
    source: order.source,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    paymentMethod: order.payments[0]?.method ?? null,
    paidCents: order.payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amountCents, 0),
  }))
  const revenue = computeRevenueSummary(normalized)

  // --- Estornos/chargeback: soma direta dos Payments do período. ----------------------
  const allPayments = orders.flatMap((o) => o.payments)
  const refunds = computeRefundTotals(allPayments)

  // --- Despesas do período. -----------------------------------------------------------
  const expensesCents = computeExpenseTotal(expenses)

  // --- Custo dos produtos vendidos / margem bruta: só pedidos totalmente pagos. -------
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID')
  const productIds = [...new Set(paidOrders.flatMap((o) => o.items.map((i) => i.productId)))]
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, costCents: true },
        })
      : []
  const costById = new Map(products.map((p) => [p.id, p.costCents]))

  const cogsItems: CogsItemInput[] = paidOrders.flatMap((o) =>
    o.items.map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      costCentsPerUnit: costById.get(item.productId) ?? null,
    })),
  )
  const cogs = computeCogsSummary(cogsItems)
  const grossMargin = computeGrossMargin(cogs)

  return {
    range,
    receivedCents: revenue.paidTotalCents,
    refundedCents: refunds.refundedCents,
    chargebackCents: refunds.chargebackCents,
    expensesCents,
    cogs,
    grossMargin,
  }
}
