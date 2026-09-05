// Cálculo de valores do pedido — puro e testável, sempre em centavos (inteiro).
// NUNCA recebe valores do cliente: opera apenas sobre dados já lidos do banco
// (preços) e sobre o frete já RECOTADO no servidor (nunca o preço vindo do cliente).
//
// Fase 5: o frete entra aqui via `opts.shippingCents`. Desconto/cupom continua 0
// (fase posterior). O total é `subtotal - desconto + frete`.

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

export interface OrderPricingOptions {
  /** Frete em centavos, já recotado no servidor. Default 0 (frete a definir). */
  shippingCents?: number
}

export function computeOrderTotals(
  lines: OrderPricingLine[],
  opts: OrderPricingOptions = {},
): OrderTotals {
  const computed: OrderPricingLineResult[] = lines.map((line) => {
    const discountCents = 0
    const totalCents = line.unitPriceCents * line.quantity - discountCents
    return { ...line, discountCents, totalCents }
  })

  const subtotalCents = computed.reduce((sum, l) => sum + l.totalCents, 0)
  const discountCents = 0
  const shippingCents = Math.max(0, Math.round(opts.shippingCents ?? 0))
  const totalCents = subtotalCents - discountCents + shippingCents

  return { lines: computed, subtotalCents, discountCents, shippingCents, totalCents }
}
