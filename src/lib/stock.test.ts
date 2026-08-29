import { describe, expect, it } from 'vitest'
import { isLowStock } from './stock'

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
