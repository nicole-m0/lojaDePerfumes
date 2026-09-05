// Tipos compartilhados do frete (Fase 5). Sem I/O, sem `server-only` — cruzam a
// fronteira servidor -> cliente (o checkout recebe `ShippingOption[]` de uma
// Server Action). Dinheiro sempre em centavos inteiros; peso em gramas; medidas
// em centímetros.

/** Dados físicos de um item comprável (do cadastro do produto). */
export interface ShippingItemInput {
  weightGrams: number
  heightCm: number
  widthCm: number
  lengthCm: number
  quantity: number
  /** Preço unitário — usado só para o valor declarado (seguro) da cotação. */
  unitPriceCents: number
}

/** Pacote único agregado a partir dos itens do carrinho. */
export interface PackageDimensions {
  weightGrams: number
  heightCm: number
  widthCm: number
  lengthCm: number
}

/** Uma opção de frete normalizada, pronta para exibir e persistir como snapshot. */
export interface ShippingOption {
  /** Id do serviço no provedor (Melhor Envio) — string por estabilidade. */
  serviceCode: string
  /** Nome do serviço, ex.: "PAC", "SEDEX", ".Package". */
  serviceName: string
  /** Transportadora, ex.: "Correios", "Jadlog". */
  carrier: string
  /** Preço do frete em centavos. */
  priceCents: number
  /** Prazo estimado em dias úteis (pode não vir do provedor). */
  deliveryDaysMin: number | null
  deliveryDaysMax: number | null
}
