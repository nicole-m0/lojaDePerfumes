// Snapshot imutável do frete escolhido, gravado em `ShippingQuote` na criação do
// pedido. Função pura (testável). O `provider` vem SEMPRE da cotação feita no
// servidor — nunca de dado enviado pelo cliente: "melhorenvio" para cotação real,
// "demo" para o frete demonstrativo.

import type { ShippingProvider } from './demo'
import type { PackageDimensions, ShippingOption } from './types'

export interface ShippingQuoteForSnapshot {
  provider: ShippingProvider
  originZip: string
  destZip: string
  package: PackageDimensions
}

export interface ShippingQuoteSnapshot {
  originZip: string
  destZip: string
  provider: ShippingProvider
  serviceCode: string
  serviceName: string
  carrier: string
  priceCents: number
  deliveryDaysMin: number | null
  deliveryDaysMax: number | null
  packageWeightGrams: number
  packageHeightCm: number
  packageWidthCm: number
  packageLengthCm: number
}

export function buildShippingQuoteSnapshot(
  quote: ShippingQuoteForSnapshot,
  option: ShippingOption,
): ShippingQuoteSnapshot {
  return {
    originZip: quote.originZip,
    destZip: quote.destZip,
    provider: quote.provider,
    serviceCode: option.serviceCode,
    serviceName: option.serviceName,
    carrier: option.carrier,
    priceCents: option.priceCents,
    deliveryDaysMin: option.deliveryDaysMin,
    deliveryDaysMax: option.deliveryDaysMax,
    packageWeightGrams: quote.package.weightGrams,
    packageHeightCm: quote.package.heightCm,
    packageWidthCm: quote.package.widthCm,
    packageLengthCm: quote.package.lengthCm,
  }
}
