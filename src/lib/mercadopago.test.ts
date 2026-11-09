import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('server-only', () => ({}))

import {
  buildPreferencePayload,
  createCheckoutPreference,
  getPublicBaseUrl,
  getMercadoPagoPayment,
  isMercadoPagoConfigured,
  isValidMercadoPagoPaymentId,
  searchMercadoPagoPaymentsByOrder,
  verifyWebhookSignature,
} from './mercadopago'

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
})

const REFUSED_TOKENS = [
  '',
  ' ',
  'TEST',
  'TEST-',
  'TEST_123',
  'test-123',
  'Test-123',
  'xTEST-123',
  ' TEST-123',
  'TEST-123 ',
  'TEST-12 3',
  'TEST-123\n',
  'APP_USR-123',
  'PROD-123',
]

const PREFERENCE_INPUT = { orderId: 'o1', orderNumber: 1, totalCents: 100, currency: 'BRL' }

const API_CALLS = [
  ['createCheckoutPreference', () => createCheckoutPreference(PREFERENCE_INPUT)],
  ['getMercadoPagoPayment', () => getMercadoPagoPayment('1')],
  ['searchMercadoPagoPaymentsByOrder', () => searchMercadoPagoPaymentsByOrder('o1')],
] as const

function setToken(token: string | undefined) {
  if (token === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
  else process.env.MERCADOPAGO_ACCESS_TOKEN = token
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('isMercadoPagoConfigured', () => {
  it.each(['TEST-123', 'TEST-abc-DEF_456'])('aceita %j', (token) => {
    setToken(token)
    expect(isMercadoPagoConfigured()).toBe(true)
  })

  it.each([undefined, ...REFUSED_TOKENS])('recusa %j', (token) => {
    setToken(token)
    expect(isMercadoPagoConfigured()).toBe(false)
  })
})

describe('proteção da credencial nas chamadas à API', () => {
  describe.each(API_CALLS)('%s', (_name, call) => {
    it.each([undefined, ...REFUSED_TOKENS])('token %j: rejeita sem nenhuma chamada ao fetch', async (token) => {
      setToken(token)
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      await expect(call()).rejects.toThrow('Credencial do Mercado Pago ausente ou recusada')

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['APP_USR-segredo-real-987', 'test-segredo-real-987'])(
      'a mensagem de erro não revela o token %j',
      async (token) => {
        setToken(token)
        vi.spyOn(globalThis, 'fetch')

        const error = (await call().catch((err: unknown) => err)) as Error

        expect(error).toBeInstanceOf(Error)
        expect(error.message).not.toContain(token)
        expect(error.message).not.toContain('segredo-real')
        expect(String(error.stack)).not.toContain('segredo-real')
      },
    )
  })

  it.each([
    ['createCheckoutPreference', () => createCheckoutPreference(PREFERENCE_INPUT), { id: 'p1', sandbox_init_point: 'https://sandbox.example/p1' }],
    ['getMercadoPagoPayment', () => getMercadoPagoPayment('1'), { id: 1, status: 'approved', external_reference: 'o1', transaction_amount: 1, currency_id: 'BRL' }],
    ['searchMercadoPagoPaymentsByOrder', () => searchMercadoPagoPaymentsByOrder('o1'), { results: [] }],
  ] as const)('%s com token TEST- chama a API uma vez, com esse token', async (_name, call, body) => {
    setToken('TEST-token-falso')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body))

    await call()

    expect(fetchSpy).toHaveBeenCalledOnce()
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TEST-token-falso')
  })
})

describe('createCheckoutPreference — somente sandbox_init_point', () => {
  const PRODUCTION_URL = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=p1'
  const SANDBOX_URL = 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=p1'

  beforeEach(() => setToken('TEST-token-falso'))

  it('com os dois links, usa o sandbox e nunca o init_point', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ id: 'p1', init_point: PRODUCTION_URL, sandbox_init_point: SANDBOX_URL }),
    )

    const preference = await createCheckoutPreference(PREFERENCE_INPUT)

    expect(preference).toEqual({ id: 'p1', initPoint: SANDBOX_URL })
  })

  it.each([
    ['ausente', { id: 'p1', init_point: PRODUCTION_URL }],
    ['vazio', { id: 'p1', init_point: PRODUCTION_URL, sandbox_init_point: '' }],
    ['nulo', { id: 'p1', init_point: PRODUCTION_URL, sandbox_init_point: null }],
  ])('sandbox_init_point %s: rejeita em vez de usar o init_point', async (_name, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body))

    const error = (await createCheckoutPreference(PREFERENCE_INPUT).catch((err: unknown) => err)) as Error

    expect(error.message).toBe('Mercado Pago: resposta de preferência sem id/sandbox_init_point.')
    expect(error.message).not.toContain(PRODUCTION_URL)
  })

  it('sem id: rejeita mesmo com sandbox_init_point', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ sandbox_init_point: SANDBOX_URL }))

    await expect(createCheckoutPreference(PREFERENCE_INPUT)).rejects.toThrow('sem id/sandbox_init_point')
  })
})

describe('buildPreferencePayload', () => {
  beforeEach(() => {
    process.env.AUTH_URL = 'https://loja.example.com'
  })

  it('usa Order.id como external_reference e o total do pedido em reais', () => {
    const p = buildPreferencePayload({
      orderId: 'ord_abc',
      orderNumber: 42,
      totalCents: 12990,
      currency: 'BRL',
    })
    expect(p.external_reference).toBe('ord_abc')
    expect(p.items).toHaveLength(1)
    expect(p.items[0].unit_price).toBe(129.9)
    expect(p.items[0].quantity).toBe(1)
    expect(p.items[0].currency_id).toBe('BRL')
  })

  it('notification_url aponta para a rota do webhook', () => {
    const p = buildPreferencePayload({ orderId: 'o1', orderNumber: 1, totalCents: 100, currency: 'BRL' })
    expect(p.notification_url).toBe('https://loja.example.com/api/webhooks/mercadopago')
    expect(p.back_urls.success).toBe('https://loja.example.com/checkout/sucesso?pedido=1')
    expect(p.back_urls.failure).toBe('https://loja.example.com/checkout/falha?pedido=1')
    expect(p.back_urls.pending).toBe('https://loja.example.com/checkout/pendente?pedido=1')
  })

  it('leva o token de confirmação nas back_urls quando informado', () => {
    const p = buildPreferencePayload({
      orderId: 'o1',
      orderNumber: 1,
      totalCents: 100,
      currency: 'BRL',
      accessToken: 'abcDEF_-0123456789abcdefghijklmn',
    })
    const q = '?pedido=1&token=abcDEF_-0123456789abcdefghijklmn'
    expect(p.back_urls.success).toBe(`https://loja.example.com/checkout/sucesso${q}`)
    expect(p.back_urls.failure).toBe(`https://loja.example.com/checkout/falha${q}`)
    expect(p.back_urls.pending).toBe(`https://loja.example.com/checkout/pendente${q}`)
  })

  it('auto_return só com base HTTPS', () => {
    process.env.AUTH_URL = 'https://loja.example.com'
    expect(buildPreferencePayload({ orderId: 'o', orderNumber: 1, totalCents: 100, currency: 'BRL' }).auto_return).toBe(
      'approved',
    )
    process.env.AUTH_URL = 'http://localhost:3000'
    expect(
      buildPreferencePayload({ orderId: 'o', orderNumber: 1, totalCents: 100, currency: 'BRL' }).auto_return,
    ).toBeUndefined()
  })

  it('currency vazia cai em BRL', () => {
    const p = buildPreferencePayload({ orderId: 'o', orderNumber: 1, totalCents: 100, currency: '' })
    expect(p.items[0].currency_id).toBe('BRL')
  })
})

describe('getPublicBaseUrl', () => {
  it('remove barra final e usa default local', () => {
    process.env.AUTH_URL = 'https://x.com/'
    expect(getPublicBaseUrl()).toBe('https://x.com')
    delete process.env.AUTH_URL
    expect(getPublicBaseUrl()).toBe('http://localhost:3000')
  })
})

describe('verifyWebhookSignature', () => {
  const secret = 'super-secret'
  const dataId = '123456'
  const xRequestId = 'req-abc-1'
  const ts = '1700000000'

  function sign(id: string) {
    const manifest = `id:${id.toLowerCase()};request-id:${xRequestId};ts:${ts};`
    return createHmac('sha256', secret).update(manifest).digest('hex')
  }

  it('aceita assinatura válida', () => {
    const v1 = sign(dataId)
    expect(
      verifyWebhookSignature({
        xSignature: `ts=${ts},v1=${v1}`,
        xRequestId,
        dataId,
        secret,
      }),
    ).toBe(true)
  })

  it('rejeita v1 adulterado', () => {
    expect(
      verifyWebhookSignature({
        xSignature: `ts=${ts},v1=${'0'.repeat(64)}`,
        xRequestId,
        dataId,
        secret,
      }),
    ).toBe(false)
  })

  it('rejeita quando falta header, dataId ou segredo', () => {
    const v1 = sign(dataId)
    const good = { xSignature: `ts=${ts},v1=${v1}`, xRequestId, dataId, secret }
    expect(verifyWebhookSignature({ ...good, xSignature: null })).toBe(false)
    expect(verifyWebhookSignature({ ...good, xRequestId: null })).toBe(false)
    expect(verifyWebhookSignature({ ...good, dataId: null })).toBe(false)
    expect(verifyWebhookSignature({ ...good, secret: null })).toBe(false)
    expect(verifyWebhookSignature({ ...good, secret: '' })).toBe(false)
  })

  it('rejeita x-signature sem ts/v1', () => {
    expect(verifyWebhookSignature({ xSignature: 'garbage', xRequestId, dataId, secret })).toBe(false)
  })

  it('assinatura de outro request-id não vale para este', () => {
    const v1 = sign(dataId)
    expect(
      verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-OUTRO', dataId, secret }),
    ).toBe(false)
  })
})

describe('isValidMercadoPagoPaymentId (Etapa D3)', () => {
  it.each(['1', '123456789012', '1'.repeat(20)])('aceita %j', (id) => {
    expect(isValidMercadoPagoPaymentId(id)).toBe(true)
  })

  it.each([null, undefined, 123, '', ' 1', '1 ', '-1', '1.5', 'abc', '12a', '../1', '1/2', '1%2F2', '1'.repeat(21)])(
    'recusa %j',
    (id) => {
      expect(isValidMercadoPagoPaymentId(id)).toBe(false)
    },
  )
})

describe('getMercadoPagoPayment — live_mode (Etapa D3)', () => {
  beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token-falso'
  })

  function stubFetch(body: Record<string, unknown>) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  }
  const raw = { id: 1, status: 'approved', external_reference: 'ord', transaction_amount: 10, currency_id: 'BRL' }

  it.each([
    [true, true],
    [false, false],
    [undefined, null],
    ['true', null],
  ])('live_mode=%j → liveMode %j', async (liveMode, expected) => {
    const spy = stubFetch(liveMode === undefined ? raw : { ...raw, live_mode: liveMode })
    const payment = await getMercadoPagoPayment('1')
    expect(payment?.liveMode).toBe(expected)
    spy.mockRestore()
  })
})
