import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Proteção de credencial no checkout: roda `createWebsiteOrder` com o módulo REAL do
// Mercado Pago e `fetch` simulado. Separado de actions.test.ts, que substitui esse
// módulo inteiro. Sem banco e sem rede; nenhuma credencial real é usada.

vi.mock('server-only', () => ({}))

const { orderCreate, txMock, getProductsForCart } = vi.hoisted(() => {
  const orderCreate = vi.fn()
  const txMock = {
    product: { findMany: vi.fn() },
    customer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    order: { create: orderCreate },
  }
  return { orderCreate, txMock, getProductsForCart: vi.fn() }
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

import { createWebsiteOrder } from './actions'

const PRODUCTION_URL = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=p1'
const SANDBOX_URL = 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=p1'

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
  delete process.env.MELHORENVIO_TOKEN
  delete process.env.MERCADOPAGO_ACCESS_TOKEN
  process.env.SHIPPING_DEMO_MODE = 'true'
  process.env.AUTH_URL = 'https://loja.example.com'
  getProductsForCart.mockResolvedValue([PRODUCT])
  txMock.product.findMany.mockResolvedValue([PRODUCT])
  txMock.customer.findFirst.mockResolvedValue(null)
  txMock.customer.create.mockResolvedValue({ id: 'c1' })
  orderCreate.mockResolvedValue({ id: 'o1', number: 42, totalCents: 17980 })
})
afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
})

function checkoutForm(): FormData {
  const fd = new FormData()
  fd.set('nonce', 'n-1')
  fd.set('items', JSON.stringify([{ productId: 'p1', quantity: 1 }]))
  fd.set('customerName', 'Cliente Teste')
  fd.set('customerEmail', 'cliente@example.com')
  fd.set('recipientName', 'Cliente Teste')
  fd.set('zipCode', '20010-000')
  fd.set('state', 'rj')
  fd.set('city', 'Rio de Janeiro')
  fd.set('neighborhood', 'Centro')
  fd.set('street', 'Rua Exemplo')
  fd.set('number', '10')
  fd.set('shippingServiceCode', 'demo-flat')
  return fd
}

/** Executa a action e devolve o destino do redirecionamento. */
async function submit(): Promise<string> {
  const message = await createWebsiteOrder({}, checkoutForm()).then(
    () => '',
    (err: Error) => err.message,
  )
  expect(message).toMatch(/^REDIRECT:/)
  return message.slice('REDIRECT:'.length)
}

const CONFIRMATION = '/checkout/sucesso?pedido=42&token=token-de-teste'

describe('createWebsiteOrder — credencial do Mercado Pago', () => {
  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['real', 'APP_USR-segredo-real-987'],
    ['minúscula', 'test-segredo-real-987'],
    ['só o prefixo', 'TEST-'],
  ])('credencial %s: pedido registrado, sem preferência e sem chamada ao fetch', async (_name, token) => {
    if (token !== undefined) process.env.MERCADOPAGO_ACCESS_TOKEN = token
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const destination = await submit()

    expect(destination).toBe(CONFIRMATION)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(orderCreate).toHaveBeenCalledOnce()
    expect(orderCreate.mock.calls[0][0].data).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' })
  })

  it('token TEST-: cria uma preferência e redireciona ao sandbox, nunca ao init_point', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token-falso'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'p1', init_point: PRODUCTION_URL, sandbox_init_point: SANDBOX_URL }), {
          status: 200,
        }),
      )

    const destination = await submit()

    expect(destination).toBe(SANDBOX_URL)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.mercadopago.com/checkout/preferences')
  })

  it('token TEST- sem sandbox_init_point: vai à confirmação, nunca ao init_point', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token-falso'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'p1', init_point: PRODUCTION_URL }), { status: 200 }),
    )

    const destination = await submit()

    expect(destination).toBe(CONFIRMATION)
    expect(destination).not.toContain('mercadopago.com')
  })
})
