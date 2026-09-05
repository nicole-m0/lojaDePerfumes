'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getProductsForCart } from '@/server/catalog'
import { computeOrderTotals } from '@/lib/order-pricing'
import { findInsufficientStockItems } from '@/lib/stock'
import { createCheckoutPreference, isMercadoPagoConfigured } from '@/lib/mercadopago'
import {
  quoteShippingForCart,
  resolveShippingSelection,
  ShippingUnavailableError,
} from '@/server/shipping'
import { isValidZip } from '@/lib/shipping/cep'
import type { ShippingItemInput, ShippingOption } from '@/lib/shipping/types'

const MAX_QTY_PER_LINE = 99
const NONCE_COOKIE = 'venus_checkout_nonce'

// ---------------------------------------------------------------------------
// Leitura: precificação do carrinho no servidor (nunca confia no cliente).
// Usada por /carrinho e /checkout para exibir o resumo com o preço real.
// ---------------------------------------------------------------------------

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
  available: boolean
}

export interface CartPricing {
  lines: CartPricingLine[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  hasUnavailable: boolean
  isEmpty: boolean
}

const rawItemsSchema = z.array(
  z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE).catch(1),
  }),
)

export async function getCartPricing(
  rawItems: { productId: string; quantity: number }[],
): Promise<CartPricing> {
  const parsed = rawItemsSchema.safeParse(rawItems)
  const items = parsed.success ? parsed.data : []

  if (items.length === 0) {
    return {
      lines: [],
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 0,
      hasUnavailable: false,
      isEmpty: true,
    }
  }

  const products = await getProductsForCart(items.map((i) => i.productId))
  const byId = new Map(products.map((p) => [p.id, p]))

  const lines: CartPricingLine[] = items.map((item) => {
    const p = byId.get(item.productId)
    const available = Boolean(p && p.status === 'ACTIVE')
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
    isEmpty: false,
  }
}

// ---------------------------------------------------------------------------
// Leitura: cotação de frete (Melhor Envio) para a tela de checkout.
// O cliente escolhe uma opção; o preço só é confiado depois de RECOTADO no
// servidor em `createWebsiteOrder`.
// ---------------------------------------------------------------------------

export interface ShippingQuoteState {
  options?: ShippingOption[]
  destZip?: string
  error?: string
}

/** Monta os itens físicos (produtos ATIVOS) para cotar frete. */
async function loadShippingItems(
  rawItems: { productId: string; quantity: number }[],
): Promise<ShippingItemInput[]> {
  const parsed = rawItemsSchema.safeParse(rawItems)
  const items = parsed.success ? parsed.data : []
  if (items.length === 0) return []

  const products = await getProductsForCart(items.map((i) => i.productId))
  const byId = new Map(products.map((p) => [p.id, p]))

  return items.flatMap((item) => {
    const p = byId.get(item.productId)
    if (!p || p.status !== 'ACTIVE') return []
    return [
      {
        weightGrams: p.weightGrams,
        heightCm: p.heightCm,
        widthCm: p.widthCm,
        lengthCm: p.lengthCm,
        quantity: item.quantity,
        unitPriceCents: p.priceCents,
      },
    ]
  })
}

export async function quoteCartShipping(input: {
  destZip: string
  items: { productId: string; quantity: number }[]
}): Promise<ShippingQuoteState> {
  const destZip = String(input.destZip ?? '')
  if (!isValidZip(destZip)) {
    return { error: 'Informe um CEP válido (8 dígitos).' }
  }

  const items = await loadShippingItems(input.items ?? [])
  if (items.length === 0) {
    return { error: 'Adicione itens disponíveis ao carrinho para calcular o frete.' }
  }

  try {
    const quote = await quoteShippingForCart({ destZip, items })
    return { options: quote.options, destZip: quote.destZip }
  } catch (err) {
    if (err instanceof ShippingUnavailableError) return { error: err.message }
    console.error('[quoteCartShipping]', err)
    return { error: 'Não foi possível calcular o frete agora. Tente novamente em instantes.' }
  }
}

// ---------------------------------------------------------------------------
// Mutação: criação do pedido do site (origem WEBSITE).
// ---------------------------------------------------------------------------

export interface CheckoutFormState {
  error?: string
  fieldErrors?: Record<string, string>
}

/** Erro esperado de validação/negócio — vira mensagem para o formulário. */
class CheckoutError extends Error {}

const checkoutSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int('Quantidade inválida.').min(1).max(MAX_QTY_PER_LINE),
        }),
      )
      .min(1, 'Seu carrinho está vazio.'),
    customerName: z.string().trim().min(2, 'Informe o nome completo.'),
    customerEmail: z
      .string()
      .trim()
      .email('E-mail inválido.')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    customerPhone: z
      .string()
      .trim()
      .min(8, 'Telefone inválido.')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    recipientName: z.string().trim().min(2, 'Informe o destinatário.'),
    zipCode: z.string().trim().min(8, 'CEP inválido.'),
    state: z.string().trim().length(2, 'Use a sigla do estado (2 letras).'),
    city: z.string().trim().min(1, 'Informe a cidade.'),
    neighborhood: z.string().trim().min(1, 'Informe o bairro.'),
    street: z.string().trim().min(1, 'Informe o logradouro.'),
    number: z.string().trim().min(1, 'Informe o número.'),
    complement: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
    reference: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
    addressPhone: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
    // Código do serviço de frete escolhido (Melhor Envio). Só referência — o
    // preço é sempre RECOTADO no servidor antes de criar o pedido.
    shippingServiceCode: z.string().trim().min(1, 'Calcule e escolha uma opção de frete.'),
  })
  .refine((d) => d.customerEmail || d.customerPhone, {
    message: 'Informe pelo menos um e-mail ou telefone de contato.',
    path: ['customerEmail'],
  })

function parseItems(value: FormDataEntryValue | null): { productId: string; quantity: number }[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((it) => ({
        productId: String(it?.productId ?? ''),
        quantity: Math.trunc(Number(it?.quantity ?? 0)),
      }))
      .filter((it) => it.productId && Number.isFinite(it.quantity))
  } catch {
    return []
  }
}

export async function createWebsiteOrder(
  _prev: CheckoutFormState,
  formData: FormData,
): Promise<CheckoutFormState> {
  const cookieStore = await cookies()
  const submittedNonce = String(formData.get('nonce') ?? '')
  const seenNonce = cookieStore.get(NONCE_COOKIE)?.value

  if (submittedNonce && seenNonce && submittedNonce === seenNonce) {
    return { error: 'Este pedido já foi enviado. Confira em seu e-mail ou telefone.' }
  }

  const parsed = checkoutSchema.safeParse({
    items: parseItems(formData.get('items')),
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail') ?? '',
    customerPhone: formData.get('customerPhone') ?? '',
    recipientName: formData.get('recipientName'),
    zipCode: formData.get('zipCode'),
    state: formData.get('state'),
    city: formData.get('city'),
    neighborhood: formData.get('neighborhood'),
    street: formData.get('street'),
    number: formData.get('number'),
    complement: formData.get('complement') ?? '',
    reference: formData.get('reference') ?? '',
    addressPhone: formData.get('addressPhone') ?? '',
    shippingServiceCode: formData.get('shippingServiceCode') ?? '',
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Dados inválidos.' }
  }

  const d = parsed.data

  // Frete: RECOTADO no servidor a partir do CEP de entrega e dos itens do
  // carrinho — o preço enviado pelo cliente nunca é autoritativo. Se a cotação
  // falhar, o pedido NÃO é criado (frete desconhecido = total incorreto).
  let shipping: { quote: Awaited<ReturnType<typeof quoteShippingForCart>>; option: ShippingOption }
  try {
    const shippingItems = await loadShippingItems(d.items)
    if (shippingItems.length === 0) {
      return { error: 'Nenhum item disponível para calcular o frete. Revise o carrinho.' }
    }
    // skipCache: a criação do pedido sempre recota no provedor — o cache só vale
    // para o botão "calcular frete" da tela de checkout.
    const quote = await quoteShippingForCart({
      destZip: d.zipCode,
      items: shippingItems,
      skipCache: true,
    })
    shipping = { quote, option: resolveShippingSelection(quote, d.shippingServiceCode) }
  } catch (err) {
    if (err instanceof ShippingUnavailableError) return { error: err.message }
    console.error('[createWebsiteOrder] cotação de frete', err)
    return { error: 'Não foi possível calcular o frete agora. Tente novamente em instantes.' }
  }

  let created: { id: string; number: number; totalCents: number }
  try {
    created = await prisma.$transaction(async (tx) => {
      // Fonte da verdade: preço e status vêm do banco, dentro da transação.
      const ids = [...new Set(d.items.map((i) => i.productId))]
      const products = await tx.product.findMany({
        where: { id: { in: ids }, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          slug: true,
          priceCents: true,
          stockOnHand: true,
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      const unavailable = d.items.filter((i) => !byId.has(i.productId))
      if (unavailable.length > 0) {
        throw new CheckoutError(
          'Um ou mais produtos do carrinho não estão mais disponíveis. Revise o carrinho.',
        )
      }

      // Checagem de disponibilidade — só bloqueia, não decrementa. A baixa real
      // acontece na confirmação do pedido (ver decrementStockForOrder).
      const insufficient = findInsufficientStockItems(
        d.items.map((i) => {
          const p = byId.get(i.productId)!
          return {
            productId: p.id,
            productName: p.name,
            requestedQuantity: i.quantity,
            availableQuantity: p.stockOnHand,
          }
        }),
      )
      if (insufficient.length > 0) {
        const names = insufficient.map((i) => i.productName).join(', ')
        throw new CheckoutError(
          `Quantidade indisponível em estoque para: ${names}. Ajuste o carrinho e tente novamente.`,
        )
      }

      const pricingInput = d.items.map((i) => ({
        unitPriceCents: byId.get(i.productId)!.priceCents,
        quantity: i.quantity,
      }))
      // Frete recotado no servidor entra aqui — trava o valor em Order.totalCents
      // ANTES de qualquer Payment ou da preferência do Mercado Pago.
      const totals = computeOrderTotals(pricingInput, {
        shippingCents: shipping.option.priceCents,
      })

      // Cliente: reaproveita o model Customer existente (sem login, sem schema novo).
      // `email`/`phone` não são @unique no schema — dedup por findFirst (ambos indexados).
      let customerId: string | undefined
      const customerMatch = d.customerEmail
        ? { email: d.customerEmail }
        : d.customerPhone
          ? { phone: d.customerPhone }
          : null

      if (customerMatch) {
        const existing = await tx.customer.findFirst({ where: customerMatch })
        const customer = existing
          ? await tx.customer.update({
              where: { id: existing.id },
              data: {
                name: d.customerName,
                email: d.customerEmail ?? existing.email,
                phone: d.customerPhone ?? existing.phone,
              },
            })
          : await tx.customer.create({
              data: {
                name: d.customerName,
                email: d.customerEmail ?? null,
                phone: d.customerPhone ?? null,
              },
            })
        customerId = customer.id
      }

      const order = await tx.order.create({
        data: {
          source: 'WEBSITE',
          status: 'PENDING',
          paymentStatus: 'PENDING',
          customerId,
          customerName: d.customerName,
          customerEmail: d.customerEmail ?? null,
          customerPhone: d.customerPhone ?? null,
          subtotalCents: totals.subtotalCents,
          discountCents: 0,
          shippingCents: totals.shippingCents,
          totalCents: totals.totalCents,
          currency: 'BRL',
          items: {
            create: d.items.map((i, idx) => {
              const p = byId.get(i.productId)!
              return {
                productId: p.id,
                productName: p.name,
                productSlug: p.slug,
                productImageUrl: p.images[0]?.url ?? null,
                unitPriceCents: p.priceCents,
                quantity: i.quantity,
                discountCents: 0,
                totalCents: totals.lines[idx].totalCents,
              }
            }),
          },
          address: {
            create: {
              recipientName: d.recipientName,
              zipCode: d.zipCode,
              state: d.state.toUpperCase(),
              city: d.city,
              neighborhood: d.neighborhood,
              street: d.street,
              number: d.number,
              complement: d.complement ?? null,
              reference: d.reference ?? null,
              phone: d.addressPhone ?? null,
            },
          },
          // Snapshot imutável da cotação de frete escolhida (Fase 5). Independe de
          // Shipment — atualizar a entrega depois não altera este registro.
          shippingQuote: {
            create: {
              originZip: shipping.quote.originZip,
              destZip: shipping.quote.destZip,
              provider: 'melhorenvio',
              serviceCode: shipping.option.serviceCode,
              serviceName: shipping.option.serviceName,
              carrier: shipping.option.carrier,
              priceCents: shipping.option.priceCents,
              deliveryDaysMin: shipping.option.deliveryDaysMin,
              deliveryDaysMax: shipping.option.deliveryDaysMax,
              packageWeightGrams: shipping.quote.package.weightGrams,
              packageHeightCm: shipping.quote.package.heightCm,
              packageWidthCm: shipping.quote.package.widthCm,
              packageLengthCm: shipping.quote.package.lengthCm,
            },
          },
          // Nenhum Payment é criado aqui: o(s) Payment(s) deste pedido nascem do
          // Mercado Pago (webhook / reconsulta) ou de registro manual no admin.
          events: {
            create: {
              type: 'ORDER_STATUS_CHANGED',
              toStatus: 'PENDING',
              note: 'Pedido criado pelo site',
            },
          },
        },
        select: { id: true, number: true, totalCents: true },
      })

      return { id: order.id, number: order.number, totalCents: order.totalCents }
    })
  } catch (err) {
    if (err instanceof CheckoutError) return { error: err.message }
    console.error('[createWebsiteOrder]', err)
    return { error: 'Não foi possível concluir o pedido agora. Tente novamente em instantes.' }
  }

  if (submittedNonce) {
    cookieStore.set(NONCE_COOKIE, submittedNonce, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    })
  }

  // Pagamento via Mercado Pago Checkout Pro: o pedido já existe (PENDING); cria a
  // preferência e redireciona para o ambiente do Mercado Pago. Sem credenciais
  // configuradas, ou se a criação da preferência falhar, cai na página de
  // confirmação — o pedido fica PENDING e o pagamento é tratado manualmente.
  let destination = `/checkout/sucesso?pedido=${created.number}`
  if (isMercadoPagoConfigured()) {
    try {
      const preference = await createCheckoutPreference({
        orderId: created.id,
        orderNumber: created.number,
        totalCents: created.totalCents,
        currency: 'BRL',
      })
      destination = preference.initPoint
    } catch (err) {
      console.error('[createWebsiteOrder] preferência Mercado Pago falhou', err)
    }
  }

  redirect(destination)
}
