import { describe, expect, it } from 'vitest'
import { buildCartPricing, type CartPricingProduct } from './cart-pricing'

function p(id: string, over: Partial<CartPricingProduct> = {}): CartPricingProduct {
  return {
    id,
    name: `Produto ${id}`,
    slug: `produto-${id}`,
    status: 'ACTIVE',
    priceCents: 1000,
    compareAtPriceCents: null,
    iconKey: null,
    gradient: null,
    stockOnHand: 10,
    images: [],
    ...over,
  }
}

describe('buildCartPricing', () => {
  it('carrinho vazio', () => {
    const r = buildCartPricing([], [])
    expect(r.isEmpty).toBe(true)
    expect(r.hasInsufficientStock).toBe(false)
  })

  it('com estoque suficiente não sinaliza nada', () => {
    const r = buildCartPricing([{ productId: 'a', quantity: 3 }], [p('a')])
    expect(r.lines[0]).toMatchObject({
      available: true,
      availableQuantity: 10,
      insufficientStock: false,
    })
    expect(r.hasInsufficientStock).toBe(false)
    expect(r.subtotalCents).toBe(3000)
  })

  it('esgotado: availableQuantity 0 e bloqueia o checkout', () => {
    const r = buildCartPricing([{ productId: 'a', quantity: 1 }], [p('a', { stockOnHand: 0 })])
    expect(r.lines[0]).toMatchObject({ availableQuantity: 0, insufficientStock: true })
    expect(r.hasInsufficientStock).toBe(true)
  })

  it('quantidade acima do estoque é sinalizada', () => {
    const r = buildCartPricing([{ productId: 'a', quantity: 5 }], [p('a', { stockOnHand: 2 })])
    expect(r.lines[0]).toMatchObject({ availableQuantity: 2, insufficientStock: true })
  })

  it('quantidade exatamente igual ao estoque é permitida', () => {
    const r = buildCartPricing([{ productId: 'a', quantity: 2 }], [p('a', { stockOnHand: 2 })])
    expect(r.hasInsufficientStock).toBe(false)
  })

  it('estoque negativo é tratado como esgotado', () => {
    const r = buildCartPricing([{ productId: 'a', quantity: 1 }], [p('a', { stockOnHand: -4 })])
    expect(r.lines[0].availableQuantity).toBe(0)
    expect(r.hasInsufficientStock).toBe(true)
  })

  it('produto inativo/arquivado ou inexistente é indisponível (não "insuficiente")', () => {
    const r = buildCartPricing(
      [
        { productId: 'a', quantity: 1 },
        { productId: 'sumiu', quantity: 1 },
      ],
      [p('a', { status: 'ARCHIVED' })],
    )
    expect(r.hasUnavailable).toBe(true)
    expect(r.hasInsufficientStock).toBe(false)
    expect(r.lines.map((l) => l.available)).toEqual([false, false])
    expect(r.subtotalCents).toBe(0)
  })
})
