// Cálculo de valores do pedido — puro e testável, sempre em centavos (inteiro).
// NUNCA recebe valores do cliente: opera apenas sobre dados já lidos do banco.
//
// Fase 3: sem desconto e sem frete. Os campos existem e ficam em 0 —
// motor de cupom e cálculo de frete são fases posteriores.

export interface OrderPricingLine {
  unitPriceCents: number
  quantity: number
}

export interface OrderPricingLineResult extends OrderPricingLine {
  discountCents: number
  totalCents: number
}

export interface OrderTotals {
  lines: OrderPricingLineResult[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
}

export function computeOrderTotals(lines: OrderPricingLine[]): OrderTotals {
  const computed: OrderPricingLineResult[] = lines.map((line) => {
    const discountCents = 0
    const totalCents = line.unitPriceCents * line.quantity - discountCents
    return { ...line, discountCents, totalCents }
  })

  const subtotalCents = computed.reduce((sum, l) => sum + l.totalCents, 0)
  const discountCents = 0
  const shippingCents = 0
  const totalCents = subtotalCents - discountCents + shippingCents

  return { lines: computed, subtotalCents, discountCents, shippingCents, totalCents }
}
