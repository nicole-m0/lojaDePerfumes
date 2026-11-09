// Precificação do carrinho — função pura (testável) usada pela Server Action
// `getCartPricing`. Opera só sobre dados já lidos do banco; nunca confia em
// preço/estoque vindos do cliente.

import { computeOrderTotals } from '@/lib/order-pricing'
import { maxPurchasableQuantity } from '@/lib/stock'

export interface CartPricingLine {
  productId: string
  name: string
  slug: string
  imageUrl: string | null
  iconKey: string | null
  gradient: string | null
  unitPriceCents: number
  compareAtPriceCents: number | null
  quantity: number
  lineTotalCents: number
  /** Produto existe e está ATIVO na loja. */
  available: boolean
  /** Unidades que podem ser compradas agora (0 = esgotado). */
  availableQuantity: number
  /** Ativo, mas a quantidade pedida passa do estoque. */
  insufficientStock: boolean
}

export interface CartPricing {
  lines: CartPricingLine[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  /** Algum item inexistente/inativo. */
  hasUnavailable: boolean
  /** Algum item ativo pedindo mais do que o estoque. */
  hasInsufficientStock: boolean
  isEmpty: boolean
}

export interface CartPricingProduct {
  id: string
  name: string
  slug: string
  status: string
  priceCents: number
  compareAtPriceCents: number | null
  iconKey: string | null
  gradient: string | null
  stockOnHand: number
  images: { url: string }[]
}

export const EMPTY_CART_PRICING: CartPricing = {
  lines: [],
  subtotalCents: 0,
  discountCents: 0,
  shippingCents: 0,
  totalCents: 0,
  hasUnavailable: false,
  hasInsufficientStock: false,
  isEmpty: true,
}

export function buildCartPricing(
  items: { productId: string; quantity: number }[],
  products: CartPricingProduct[],
): CartPricing {
  if (items.length === 0) return EMPTY_CART_PRICING

  const byId = new Map(products.map((p) => [p.id, p]))

  const lines: CartPricingLine[] = items.map((item) => {
    const p = byId.get(item.productId)
    const available = Boolean(p && p.status === 'ACTIVE')
    const availableQuantity = available ? maxPurchasableQuantity(p!.stockOnHand) : 0
    const unitPriceCents = p?.priceCents ?? 0
    return {
      productId: item.productId,
      name: p?.name ?? 'Produto indisponível',
      slug: p?.slug ?? '',
      imageUrl: p?.images[0]?.url ?? null,
      iconKey: p?.iconKey ?? null,
      gradient: p?.gradient ?? null,
      unitPriceCents,
      compareAtPriceCents: p?.compareAtPriceCents ?? null,
      quantity: item.quantity,
      lineTotalCents: available ? unitPriceCents * item.quantity : 0,
      available,
      availableQuantity,
      insufficientStock: available && item.quantity > availableQuantity,
    }
  })

  const totals = computeOrderTotals(
    lines
      .filter((l) => l.available)
      .map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
  )

  return {
    lines,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    shippingCents: totals.shippingCents,
    totalCents: totals.totalCents,
    hasUnavailable: lines.some((l) => !l.available),
    hasInsufficientStock: lines.some((l) => l.insufficientStock),
    isEmpty: false,
  }
}
