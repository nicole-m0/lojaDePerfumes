import { describe, expect, it } from 'vitest'
import { buildShippingQuoteSnapshot } from './snapshot'
import { buildDemoShippingOption } from './demo'

const pkg = { weightGrams: 600, heightCm: 12, widthCm: 11, lengthCm: 16 }

describe('buildShippingQuoteSnapshot', () => {
  it('frete demonstrativo grava provider "demo" e os dados fictícios da opção', () => {
    const snap = buildShippingQuoteSnapshot(
      { provider: 'demo', originZip: '', destZip: '20010000', package: pkg },
      buildDemoShippingOption(1990),
    )
    expect(snap).toEqual({
      originZip: '',
      destZip: '20010000',
      provider: 'demo',
      serviceCode: 'demo-flat',
      serviceName: 'Frete simulado',
      carrier: 'Demonstração',
      priceCents: 1990,
      deliveryDaysMin: 5,
      deliveryDaysMax: 8,
      packageWeightGrams: 600,
      packageHeightCm: 12,
      packageWidthCm: 11,
      packageLengthCm: 16,
    })
    // `simulated` é só de interface — não é coluna do ShippingQuote.
    expect(snap).not.toHaveProperty('simulated')
  })

  it('cotação do Melhor Envio grava provider "melhorenvio"', () => {
    const snap = buildShippingQuoteSnapshot(
      { provider: 'melhorenvio', originZip: '01001000', destZip: '20010000', package: pkg },
      {
        serviceCode: '1',
        serviceName: 'PAC',
        carrier: 'Correios',
        priceCents: 2340,
        deliveryDaysMin: 6,
        deliveryDaysMax: 8,
      },
    )
    expect(snap.provider).toBe('melhorenvio')
    expect(snap.serviceCode).toBe('1')
    expect(snap.carrier).toBe('Correios')
  })
})
