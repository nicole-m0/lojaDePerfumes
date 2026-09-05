import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('server-only', () => ({}))

import {
  buildPreferencePayload,
  getPublicBaseUrl,
  isMercadoPagoConfigured,
  verifyWebhookSignature,
} from './mercadopago'

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
})

describe('isMercadoPagoConfigured', () => {
  it('true só quando há MERCADOPAGO_ACCESS_TOKEN', () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    expect(isMercadoPagoConfigured()).toBe(false)
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-123'
    expect(isMercadoPagoConfigured()).toBe(true)
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
