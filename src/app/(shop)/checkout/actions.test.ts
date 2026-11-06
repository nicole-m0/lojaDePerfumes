import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Persistência do provider do frete na criação do pedido (Etapa D1). Roda a action
// real `createWebsiteOrder` com Prisma, cookies, redirect e catálogo simulados —
// nenhum banco é acessado. A cotação passa pelo serviço de frete real; só a chamada
// HTTP ao Melhor Envio (`calculateShipping`) é substituída.

vi.mock('server-only', () => ({}))

const { orderCreate, txMock, calculateShipping, getProductsForCart } = vi.hoisted(() => {
  const orderCreate = vi.fn()
  const txMock = {
    product: { findMany: vi.fn() },
    customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    order: { create: orderCreate },
  }
  return {
    orderCreate,
    txMock,
    calculateShipping: vi.fn(),
    getProductsForCart: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: (fn: (tx: typeof txMock) => unknown) => fn(txMock) },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/server/catalog', () => ({ getProductsForCart }))
vi.mock('@/server/orders', () => ({ issueOrderAccessToken: () => 'token-de-teste' }))
vi.mock('@/lib/mercadopago', () => ({
  isMercadoPagoConfigured: () => false,
  createCheckoutPreference: vi.fn(),
}))
vi.mock('@/lib/shipping/melhorenvio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/shipping/melhorenvio')>()),
  calculateShipping,
}))

import { createWebsiteOrder, quoteCartShipping } from './actions'
import { __clearShippingCache } from '@/server/shipping'

const PRODUCT = {
  id: 'p1',
  name: 'Eau de Parfum Rosalume',
  slug: 'eau-de-parfum-rosalume',
  status: 'ACTIVE',
  priceCents: 15990,
  compareAtPriceCents: null,
  iconKey: null,
  gradient: null,
  stockOnHand: 10,
  weightGrams: 300,
  heightCm: 6,
  widthCm: 11,
  lengthCm: 16,
  images: [],
}

const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  __clearShippingCache()
  delete process.env.MELHORENVIO_TOKEN
  delete process.env.SHIPPING_DEMO_MODE
  delete process.env.SHIPPING_DEMO_FLAT_CENTS
  process.env.SHIPPING_ORIGIN_ZIP = '01001-000'
  getProductsForCart.mockResolvedValue([PRODUCT])
  txMock.product.findMany.mockResolvedValue([PRODUCT])
  txMock.customer.findFirst.mockResolvedValue(null)
  txMock.customer.create.mockResolvedValue({ id: 'c1' })
  orderCreate.mockResolvedValue({ id: 'o1', number: 42, totalCents: 0 })
})
afterEach(() => {
  process.env = { ...ORIG }
})

function checkoutForm(shippingServiceCode: string): FormData {
  const fd = new FormData()
  fd.set('nonce', 'n-1')
  fd.set('items', JSON.stringify([{ productId: 'p1', quantity: 2 }]))
  fd.set('customerName', 'Cliente Teste')
  fd.set('customerEmail', 'cliente@example.com')
  fd.set('recipientName', 'Cliente Teste')
  fd.set('zipCode', '20010-000')
  fd.set('state', 'rj')
  fd.set('city', 'Rio de Janeiro')
  fd.set('neighborhood', 'Centro')
  fd.set('street', 'Rua Exemplo')
  fd.set('number', '10')
  fd.set('shippingServiceCode', shippingServiceCode)
  return fd
}

/** Executa a action e devolve os dados passados a `order.create` (ou o erro retornado). */
async function submit(shippingServiceCode: string) {
  let redirectedTo: string | null = null
  let state: unknown = null
  try {
    state = await createWebsiteOrder({}, checkoutForm(shippingServiceCode))
  } catch (err) {
    const message = (err as Error).message
    if (!message.startsWith('REDIRECT:')) throw err
    redirectedTo = message.slice('REDIRECT:'.length)
  }
  const data = orderCreate.mock.calls[0]?.[0]?.data
  return { state, redirectedTo, data }
}

describe('createWebsiteOrder — provider do frete', () => {
  it('modo demo: grava provider "demo" com valor e prazo simulados e soma o frete ao total', async () => {
    process.env.SHIPPING_DEMO_MODE = 'true'

    const { redirectedTo, data } = await submit('demo-flat')

    expect(redirectedTo).toContain('/checkout/sucesso?pedido=42')
    expect(calculateShipping).not.toHaveBeenCalled()
    expect(data.shippingQuote.create).toMatchObject({
      provider: 'demo',
      serviceCode: 'demo-flat',
      serviceName: 'Frete simulado',
      carrier: 'Demonstração',
      priceCents: 1990,
      deliveryDaysMin: 5,
      deliveryDaysMax: 8,
      originZip: '01001000',
      destZip: '20010000',
    })
    expect(data.shippingCents).toBe(1990)
    expect(data.subtotalCents).toBe(31980)
    expect(data.totalCents).toBe(31980 + 1990)
  })

  it('Melhor Envio configurado: grava provider "melhorenvio" mesmo com o modo demo ligado', async () => {
    process.env.MELHORENVIO_TOKEN = 'tok'
    process.env.SHIPPING_DEMO_MODE = 'true'
    calculateShipping.mockResolvedValue([
      {
        serviceCode: '1',
        serviceName: 'PAC',
        carrier: 'Correios',
        priceCents: 2340,
        deliveryDaysMin: 6,
        deliveryDaysMax: 8,
      },
    ])

    const { data } = await submit('1')

    expect(calculateShipping).toHaveBeenCalledOnce()
    expect(data.shippingQuote.create).toMatchObject({
      provider: 'melhorenvio',
      serviceCode: '1',
      carrier: 'Correios',
      priceCents: 2340,
    })
    expect(data.shippingCents).toBe(2340)
  })

  it('Melhor Envio configurado: o código "demo-flat" enviado pelo cliente é recusado', async () => {
    process.env.MELHORENVIO_TOKEN = 'tok'
    process.env.SHIPPING_DEMO_MODE = 'true'
    calculateShipping.mockResolvedValue([
      {
        serviceCode: '1',
        serviceName: 'PAC',
        carrier: 'Correios',
        priceCents: 2340,
        deliveryDaysMin: 6,
        deliveryDaysMax: 8,
      },
    ])

    const { state, data } = await submit('demo-flat')

    expect(state).toEqual({
      error: 'A opção de frete escolhida não está mais disponível. Recalcule o frete.',
    })
    expect(data).toBeUndefined()
  })

  it('modo demo desligado e Melhor Envio não configurado: nenhum pedido é criado', async () => {
    const { state, data } = await submit('demo-flat')

    expect(state).toEqual({ error: 'Cálculo de frete indisponível no momento.' })
    expect(data).toBeUndefined()
  })
})

describe('quoteCartShipping — opção exibida no checkout', () => {
  it('modo demo devolve a opção marcada como simulada', async () => {
    process.env.SHIPPING_DEMO_MODE = 'true'

    const result = await quoteCartShipping({
      destZip: '20010-000',
      items: [{ productId: 'p1', quantity: 1 }],
    })

    expect(result.error).toBeUndefined()
    expect(result.options).toHaveLength(1)
    expect(result.options?.[0]).toMatchObject({ serviceCode: 'demo-flat', simulated: true })
  })
})
