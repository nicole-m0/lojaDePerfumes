import { describe, expect, it } from 'vitest'
import {
  clampToAvailable,
  findInsufficientStockItems,
  isLowStock,
  isOutOfStock,
  maxPurchasableQuantity,
  MAX_QTY_PER_LINE,
  type StockAvailabilityItem,
} from './stock'

describe('isLowStock', () => {
  it('sinaliza estoque zerado ou negativo', () => {
    expect(isLowStock(0)).toBe(true)
    expect(isLowStock(-3)).toBe(true)
  })

  it('não sinaliza quando há saldo positivo', () => {
    expect(isLowStock(1)).toBe(false)
    expect(isLowStock(42)).toBe(false)
  })
})

function item(overrides: Partial<StockAvailabilityItem>): StockAvailabilityItem {
  return {
    productId: 'p1',
    productName: 'Produto',
    requestedQuantity: 1,
    availableQuantity: 1,
    ...overrides,
  }
}

describe('findInsufficientStockItems', () => {
  it('retorna vazio quando todos os itens têm saldo suficiente', () => {
    const items = [item({ requestedQuantity: 2, availableQuantity: 2 }), item({ requestedQuantity: 1, availableQuantity: 5 })]
    expect(findInsufficientStockItems(items)).toEqual([])
  })

  it('retorna só os itens cuja quantidade pedida excede o disponível', () => {
    const ok = item({ productId: 'ok', requestedQuantity: 1, availableQuantity: 1 })
    const short = item({ productId: 'short', requestedQuantity: 3, availableQuantity: 2 })
    expect(findInsufficientStockItems([ok, short])).toEqual([short])
  })

  it('considera insuficiente quando o disponível é zero', () => {
    const zeroed = item({ requestedQuantity: 1, availableQuantity: 0 })
    expect(findInsufficientStockItems([zeroed])).toEqual([zeroed])
  })
})

describe('maxPurchasableQuantity / isOutOfStock', () => {
  it('esgotado com saldo zero, negativo ou ausente', () => {
    for (const v of [0, -2, null, undefined, Number.NaN]) {
      expect(maxPurchasableQuantity(v)).toBe(0)
      expect(isOutOfStock(v)).toBe(true)
    }
  })

  it('usa o saldo, limitado ao máximo por linha', () => {
    expect(maxPurchasableQuantity(3)).toBe(3)
    expect(maxPurchasableQuantity(500)).toBe(MAX_QTY_PER_LINE)
    expect(isOutOfStock(1)).toBe(false)
  })
})

describe('clampToAvailable', () => {
  it('não deixa passar do estoque conhecido', () => {
    expect(clampToAvailable(5, 2)).toBe(2)
    expect(clampToAvailable(2, 2)).toBe(2)
    expect(clampToAvailable(1, 0)).toBe(0)
  })

  it('estoque desconhecido (carrinho antigo) aplica só o limite por linha', () => {
    expect(clampToAvailable(5, undefined)).toBe(5)
    expect(clampToAvailable(1000, undefined)).toBe(MAX_QTY_PER_LINE)
  })

  it('nunca devolve negativo nem fração', () => {
    expect(clampToAvailable(-3, 10)).toBe(0)
    expect(clampToAvailable(2.7, 10)).toBe(2)
  })
})
