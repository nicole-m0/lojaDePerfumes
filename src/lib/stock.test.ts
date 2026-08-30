import { describe, expect, it } from 'vitest'
import { findInsufficientStockItems, isLowStock, type StockAvailabilityItem } from './stock'

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
