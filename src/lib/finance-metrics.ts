// Agregações puras do financeiro (Fase 6) — recebem dados já buscados do banco
// (src/server/finance.ts) e calculam os números exibidos. Sem Prisma aqui: só
// transformação de dados, testável isolado (mesmo padrão de dashboard-metrics.ts).
//
// Receita recebida reaproveita `computeRevenueSummary` (dashboard-metrics.ts) — não é
// recalculada aqui. Este módulo cobre o que a Fase 6 acrescenta: estornos/chargeback,
// despesas e custo/margem dos produtos vendidos.

export interface RefundLike {
  status: string
  amountCents: number
}

export interface RefundTotals {
  refundedCents: number
  chargebackCents: number
}

/** Soma REFUNDED e CHARGEBACK entre os Payments do período — nunca soma PAID/PENDING/FAILED. */
export function computeRefundTotals(payments: RefundLike[]): RefundTotals {
  let refundedCents = 0
  let chargebackCents = 0
  for (const p of payments) {
    if (p.status === 'REFUNDED') refundedCents += p.amountCents
    else if (p.status === 'CHARGEBACK') chargebackCents += p.amountCents
  }
  return { refundedCents, chargebackCents }
}

export interface ExpenseLike {
  amountCents: number
}

/** Soma o valor de despesas do período. Puro — a rejeição de valores <= 0 é na escrita (src/server/expenses.ts). */
export function computeExpenseTotal(expenses: ExpenseLike[]): number {
  return expenses.reduce((sum, e) => sum + e.amountCents, 0)
}

// ---------------------------------------------------------------------------
// Custo dos produtos vendidos (CMV) e margem bruta.
//
// Regra central da Fase 6: produto SEM custo cadastrado (`costCentsPerUnit === null`)
// NUNCA entra no cálculo como custo zero. Os itens sem custo são separados
// (`unknownCost*`) e a margem bruta é calculada só sobre a fatia com custo conhecido —
// misturar receita de itens sem custo com um CMV incompleto infuenciaria a margem
// para cima de forma artificial.
// ---------------------------------------------------------------------------

export interface CogsItemInput {
  quantity: number
  /** Preço unitário snapshot do OrderItem (nunca o preço atual de Product). */
  unitPriceCents: number
  /** `null` = custo não informado no cadastro do produto. NUNCA tratar como 0. */
  costCentsPerUnit: number | null
}

export interface CogsSummary {
  /** Custo total apenas dos itens com `costCentsPerUnit` conhecido. */
  knownCostCents: number
  /** Receita (unitPriceCents × quantity) apenas dos itens com custo conhecido — base da margem. */
  knownRevenueCents: number
  /** Receita de itens vendidos SEM custo cadastrado — informativo, fora da margem. */
  unknownCostRevenueCents: number
  /** Quantidade de unidades vendidas sem custo cadastrado. */
  unknownCostQuantity: number
  /** true quando há ao menos um item vendido sem custo cadastrado no período. */
  hasUnknownCost: boolean
}

export function computeCogsSummary(items: CogsItemInput[]): CogsSummary {
  let knownCostCents = 0
  let knownRevenueCents = 0
  let unknownCostRevenueCents = 0
  let unknownCostQuantity = 0

  for (const item of items) {
    const lineRevenueCents = item.unitPriceCents * item.quantity
    if (item.costCentsPerUnit === null) {
      unknownCostRevenueCents += lineRevenueCents
      unknownCostQuantity += item.quantity
    } else {
      knownCostCents += item.costCentsPerUnit * item.quantity
      knownRevenueCents += lineRevenueCents
    }
  }

  return {
    knownCostCents,
    knownRevenueCents,
    unknownCostRevenueCents,
    unknownCostQuantity,
    hasUnknownCost: unknownCostQuantity > 0,
  }
}

export interface GrossMargin {
  marginCents: number
  /** null quando não há receita com custo conhecido para servir de base (nada a dividir). */
  marginPercent: number | null
  /** false quando não há nenhum item com custo conhecido no período — nada a exibir. */
  available: boolean
}

/** Margem bruta calculada SOMENTE sobre a fatia de itens com custo conhecido (ver CogsSummary). */
export function computeGrossMargin(cogs: Pick<CogsSummary, 'knownCostCents' | 'knownRevenueCents'>): GrossMargin {
  const available = cogs.knownRevenueCents > 0
  const marginCents = cogs.knownRevenueCents - cogs.knownCostCents
  return {
    marginCents,
    marginPercent: available ? marginCents / cogs.knownRevenueCents : null,
    available,
  }
}
