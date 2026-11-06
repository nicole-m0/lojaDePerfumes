import { describe, expect, it } from 'vitest'
import {
  computeRefundTotals,
  computeExpenseTotal,
  computeCogsSummary,
  computeGrossMargin,
  type CogsItemInput,
} from './finance-metrics'

describe('computeRefundTotals', () => {
  it('soma REFUNDED e CHARGEBACK separadamente, ignorando outros status', () => {
    const payments = [
      { status: 'PAID', amountCents: 10000 },
      { status: 'REFUNDED', amountCents: 3000 },
      { status: 'REFUNDED', amountCents: 2000 },
      { status: 'CHARGEBACK', amountCents: 1500 },
      { status: 'PENDING', amountCents: 500 },
    ]
    expect(computeRefundTotals(payments)).toEqual({ refundedCents: 5000, chargebackCents: 1500 })
  })

  it('retorna zero para lista vazia', () => {
    expect(computeRefundTotals([])).toEqual({ refundedCents: 0, chargebackCents: 0 })
  })
})

describe('computeExpenseTotal', () => {
  it('soma o valor das despesas', () => {
    expect(computeExpenseTotal([{ amountCents: 1000 }, { amountCents: 2500 }])).toBe(3500)
  })

  it('retorna zero para lista vazia', () => {
    expect(computeExpenseTotal([])).toBe(0)
  })
})

describe('computeCogsSummary', () => {
  it('separa itens com custo conhecido dos sem custo — nunca trata null como zero', () => {
    const items: CogsItemInput[] = [
      { quantity: 2, unitPriceCents: 5000, costCentsPerUnit: 2000 }, // conhecido: receita 10000, custo 4000
      { quantity: 1, unitPriceCents: 8000, costCentsPerUnit: null }, // desconhecido: receita 8000
    ]
    const summary = computeCogsSummary(items)
    expect(summary.knownRevenueCents).toBe(10000)
    expect(summary.knownCostCents).toBe(4000)
    expect(summary.unknownCostRevenueCents).toBe(8000)
    expect(summary.unknownCostQuantity).toBe(1)
    expect(summary.hasUnknownCost).toBe(true)
  })

  it('custo explicitamente zero é tratado como conhecido (não como desconhecido)', () => {
    const items: CogsItemInput[] = [{ quantity: 3, unitPriceCents: 1000, costCentsPerUnit: 0 }]
    const summary = computeCogsSummary(items)
    expect(summary.knownCostCents).toBe(0)
    expect(summary.knownRevenueCents).toBe(3000)
    expect(summary.hasUnknownCost).toBe(false)
    expect(summary.unknownCostQuantity).toBe(0)
  })

  it('hasUnknownCost é false quando todos os itens têm custo cadastrado', () => {
    const items: CogsItemInput[] = [{ quantity: 1, unitPriceCents: 1000, costCentsPerUnit: 400 }]
    expect(computeCogsSummary(items).hasUnknownCost).toBe(false)
  })

  it('lista vazia não quebra e marca margem como indisponível a jusante', () => {
    const summary = computeCogsSummary([])
    expect(summary.knownRevenueCents).toBe(0)
    expect(summary.knownCostCents).toBe(0)
    expect(summary.hasUnknownCost).toBe(false)
  })
})

describe('computeGrossMargin', () => {
  it('calcula margem em centavos e em percentual sobre a receita de custo conhecido', () => {
    const margin = computeGrossMargin({ knownRevenueCents: 10000, knownCostCents: 4000 })
    expect(margin.marginCents).toBe(6000)
    expect(margin.marginPercent).toBeCloseTo(0.6)
    expect(margin.available).toBe(true)
  })

  it('fica indisponível (available=false) quando não há receita de custo conhecido', () => {
    const margin = computeGrossMargin({ knownRevenueCents: 0, knownCostCents: 0 })
    expect(margin.available).toBe(false)
    expect(margin.marginPercent).toBeNull()
    // marginCents continua calculável (0 - 0 = 0), mas a UI não deve exibir quando available=false.
    expect(margin.marginCents).toBe(0)
  })

  it('não infla a margem misturando receita de itens sem custo: cenário combinado', () => {
    // 2 produtos com custo conhecido (margem real 50%) + 1 produto sem custo cadastrado.
    // A margem deve refletir SOMENTE os itens com custo conhecido, nunca a receita total.
    const items: CogsItemInput[] = [
      { quantity: 1, unitPriceCents: 10000, costCentsPerUnit: 5000 }, // conhecido
      { quantity: 1, unitPriceCents: 20000, costCentsPerUnit: null }, // desconhecido — não deve entrar na margem
    ]
    const cogs = computeCogsSummary(items)
    const margin = computeGrossMargin(cogs)
    expect(cogs.hasUnknownCost).toBe(true)
    expect(margin.marginPercent).toBeCloseTo(0.5) // e não ~0.83 se a receita desconhecida entrasse no cálculo
  })
})
