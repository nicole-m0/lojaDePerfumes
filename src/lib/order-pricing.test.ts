import { describe, expect, it } from 'vitest'
import { computeOrderTotals } from './order-pricing'

describe('computeOrderTotals', () => {
  it('carrinho vazio resulta em zeros', () => {
    const t = computeOrderTotals([])
    expect(t).toEqual({
      lines: [],
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 0,
    })
  })

  it('multiplica preço unitário pela quantidade', () => {
    const t = computeOrderTotals([{ unitPriceCents: 8000, quantity: 3 }])
    expect(t.lines[0].totalCents).toBe(24000)
    expect(t.subtotalCents).toBe(24000)
    expect(t.totalCents).toBe(24000)
  })

  it('soma várias linhas no subtotal e total', () => {
    const t = computeOrderTotals([
      { unitPriceCents: 12990, quantity: 2 },
      { unitPriceCents: 4500, quantity: 1 },
    ])
    expect(t.subtotalCents).toBe(30480)
    expect(t.totalCents).toBe(30480)
  })

  it('desconto e frete são sempre 0 nesta fase', () => {
    const t = computeOrderTotals([{ unitPriceCents: 10000, quantity: 1 }])
    expect(t.discountCents).toBe(0)
    expect(t.shippingCents).toBe(0)
    expect(t.lines[0].discountCents).toBe(0)
  })
})
