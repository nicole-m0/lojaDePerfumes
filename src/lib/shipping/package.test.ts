import { describe, expect, it } from 'vitest'
import {
  aggregatePackage,
  declaredValueCents,
  MIN_HEIGHT_CM,
  MIN_LENGTH_CM,
  MIN_WEIGHT_GRAMS,
  MIN_WIDTH_CM,
} from './package'
import type { ShippingItemInput } from './types'

const item = (over: Partial<ShippingItemInput> = {}): ShippingItemInput => ({
  weightGrams: 300,
  heightCm: 6,
  widthCm: 11,
  lengthCm: 16,
  quantity: 1,
  unitPriceCents: 12990,
  ...over,
})

describe('aggregatePackage', () => {
  it('soma o peso por quantidade', () => {
    const pkg = aggregatePackage([item({ weightGrams: 300, quantity: 3 })])
    expect(pkg.weightGrams).toBe(900)
  })

  it('empilha a altura (soma) e usa o maior width/length', () => {
    const pkg = aggregatePackage([
      item({ heightCm: 6, widthCm: 11, lengthCm: 16, quantity: 2 }),
      item({ heightCm: 8, widthCm: 20, lengthCm: 30, quantity: 1 }),
    ])
    expect(pkg.heightCm).toBe(6 * 2 + 8) // 20
    expect(pkg.widthCm).toBe(20)
    expect(pkg.lengthCm).toBe(30)
  })

  it('aplica os mínimos de encomenda quando o pacote é pequeno', () => {
    const pkg = aggregatePackage([
      item({ weightGrams: 10, heightCm: 1, widthCm: 2, lengthCm: 3, quantity: 1 }),
    ])
    expect(pkg.weightGrams).toBe(MIN_WEIGHT_GRAMS)
    expect(pkg.heightCm).toBe(MIN_HEIGHT_CM)
    expect(pkg.widthCm).toBe(MIN_WIDTH_CM)
    expect(pkg.lengthCm).toBe(MIN_LENGTH_CM)
  })

  it('ignora linhas com quantidade zero', () => {
    const pkg = aggregatePackage([
      item({ weightGrams: 500, quantity: 0 }),
      item({ weightGrams: 200, quantity: 2 }),
    ])
    expect(pkg.weightGrams).toBe(400)
  })

  it('arredonda dimensões fracionárias para cima', () => {
    const pkg = aggregatePackage([item({ weightGrams: 120.4, quantity: 1 })])
    expect(pkg.weightGrams).toBe(121)
  })
})

describe('declaredValueCents', () => {
  it('soma preço unitário * quantidade em centavos', () => {
    expect(
      declaredValueCents([
        item({ unitPriceCents: 12990, quantity: 2 }),
        item({ unitPriceCents: 4500, quantity: 1 }),
      ]),
    ).toBe(30480)
  })

  it('desconsidera linhas zeradas', () => {
    expect(declaredValueCents([item({ unitPriceCents: 9999, quantity: 0 })])).toBe(0)
  })
})
