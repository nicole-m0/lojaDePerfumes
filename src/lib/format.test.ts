import { describe, expect, it } from 'vitest'
import { centsToReais, discountPercent, formatPrice, reaisToCents } from './format'

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

describe('reaisToCents / centsToReais', () => {
  it('converte reais (número ou string) em centavos inteiros', () => {
    expect(reaisToCents(129.9)).toBe(12990)
    expect(reaisToCents('129,90')).toBe(12990)
    expect(reaisToCents('R$ 1.299,90')).toBe(129990)
    expect(reaisToCents('49.99')).toBe(4999)
    expect(reaisToCents('abc')).toBe(0)
  })

  it('volta de centavos para reais', () => {
    expect(centsToReais(12990)).toBe(129.9)
    expect(centsToReais(0)).toBe(0)
  })
})
