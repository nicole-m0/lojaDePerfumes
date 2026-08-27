import { describe, expect, it } from 'vitest'
import { discountPercent, formatPrice } from './format'

// Normaliza espaços (o Intl usa NBSP / narrow no-break space entre "R$" e o valor).
const norm = (s: string) => s.replace(/\s/g, ' ')

describe('formatPrice', () => {
  it('formata valores em BRL', () => {
    expect(norm(formatPrice(129.9))).toBe('R$ 129,90')
    expect(norm(formatPrice(0))).toBe('R$ 0,00')
  })
})

describe('discountPercent', () => {
  it('calcula o percentual de desconto arredondado', () => {
    expect(discountPercent(129.9, 185.9)).toBe(30)
  })

  it('retorna null quando não há preço original ou não há desconto', () => {
    expect(discountPercent(100)).toBeNull()
    expect(discountPercent(100, 90)).toBeNull()
    expect(discountPercent(100, 100)).toBeNull()
  })
})
