import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildCalculatePayload,
  calculateShipping,
  getShippingOriginZip,
  isMelhorEnvioConfigured,
  melhorEnvioBaseUrl,
  normalizeRates,
} from './melhorenvio'

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const pkg = { weightGrams: 900, heightCm: 12, widthCm: 11, lengthCm: 16 }

describe('isMelhorEnvioConfigured', () => {
  it('exige token E CEP de origem válido', () => {
    delete process.env.MELHORENVIO_TOKEN
    delete process.env.SHIPPING_ORIGIN_ZIP
    expect(isMelhorEnvioConfigured()).toBe(false)

    process.env.MELHORENVIO_TOKEN = 'tok'
    expect(isMelhorEnvioConfigured()).toBe(false)

    process.env.SHIPPING_ORIGIN_ZIP = '01001-000'
    expect(isMelhorEnvioConfigured()).toBe(true)

    process.env.SHIPPING_ORIGIN_ZIP = '123'
    expect(isMelhorEnvioConfigured()).toBe(false)
  })
})

describe('getShippingOriginZip', () => {
  it('normaliza para 8 dígitos', () => {
    process.env.SHIPPING_ORIGIN_ZIP = '01001-000'
    expect(getShippingOriginZip()).toBe('01001000')
    delete process.env.SHIPPING_ORIGIN_ZIP
    expect(getShippingOriginZip()).toBe('')
  })
})

describe('melhorEnvioBaseUrl', () => {
  it('sandbox por padrão, produção só com MELHORENVIO_SANDBOX=false', () => {
    delete process.env.MELHORENVIO_SANDBOX
    expect(melhorEnvioBaseUrl()).toContain('sandbox.melhorenvio')
    process.env.MELHORENVIO_SANDBOX = 'true'
    expect(melhorEnvioBaseUrl()).toContain('sandbox.melhorenvio')
    process.env.MELHORENVIO_SANDBOX = 'false'
    expect(melhorEnvioBaseUrl()).toBe('https://www.melhorenvio.com.br')
  })
})

describe('buildCalculatePayload', () => {
  it('converte peso p/ kg, valor declarado p/ reais e limpa os CEPs', () => {
    const body = buildCalculatePayload({
      originZip: '01001-000',
      destZip: '20010 000',
      pkg,
      declaredValueCents: 25980,
    })
    expect(body.from.postal_code).toBe('01001000')
    expect(body.to.postal_code).toBe('20010000')
    expect(body.package).toEqual({ height: 12, width: 11, length: 16, weight: 0.9 })
    expect(body.options.insurance_value).toBe(259.8)
    expect(body.options.receipt).toBe(false)
    expect(body.options.own_hand).toBe(false)
  })

  it('usa os serviços de MELHORENVIO_SERVICES quando definido', () => {
    process.env.MELHORENVIO_SERVICES = '1,2,3'
    expect(buildCalculatePayload({ originZip: '1', destZip: '2', pkg, declaredValueCents: 0 }).services).toBe(
      '1,2,3',
    )
  })

  it('valor declarado negativo vira 0', () => {
    const body = buildCalculatePayload({ originZip: '1', destZip: '2', pkg, declaredValueCents: -10 })
    expect(body.options.insurance_value).toBe(0)
  })
})

describe('normalizeRates', () => {
  it('descarta serviços com erro ou sem preço e ordena por preço', () => {
    const options = normalizeRates([
      {
        id: 2,
        name: 'SEDEX',
        price: '39.90',
        delivery_range: { min: 2, max: 3 },
        company: { name: 'Correios' },
      },
      {
        id: 1,
        name: 'PAC',
        price: '23.40',
        delivery_time: 8,
        delivery_range: { min: 6, max: 8 },
        company: { name: 'Correios' },
      },
      { id: 3, name: 'Jadlog', error: 'CEP fora de área' },
      { id: 4, name: 'Sem preço' },
    ])
    expect(options.map((o) => o.serviceCode)).toEqual(['1', '2'])
    expect(options[0]).toEqual({
      serviceCode: '1',
      serviceName: 'PAC',
      carrier: 'Correios',
      priceCents: 2340,
      deliveryDaysMin: 6,
      deliveryDaysMax: 8,
    })
    expect(options[1].deliveryDaysMin).toBe(2)
  })

  it('cai para delivery_time quando não há delivery_range', () => {
    const [opt] = normalizeRates([{ id: 1, name: 'PAC', price: '10.00', delivery_time: 7 }])
    expect(opt.deliveryDaysMin).toBeNull()
    expect(opt.deliveryDaysMax).toBe(7)
  })

  it('resposta não-array vira lista vazia', () => {
    expect(normalizeRates({ message: 'erro' })).toEqual([])
  })
})

describe('calculateShipping', () => {
  const input = {
    originZip: '01001000',
    destZip: '20010000',
    pkg,
    declaredValueCents: 12990,
  }

  it('faz POST autenticado e normaliza a resposta', async () => {
    process.env.MELHORENVIO_TOKEN = 'tok-123'
    process.env.MELHORENVIO_SANDBOX = 'true'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ id: 1, name: 'PAC', price: '23.40', company: { name: 'Correios' } }]),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const options = await calculateShipping(input)

    expect(options).toHaveLength(1)
    expect(options[0].priceCents).toBe(2340)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(init.headers['User-Agent']).toBeTruthy()
  })

  it('erro HTTP vira exceção', async () => {
    process.env.MELHORENVIO_TOKEN = 'tok-123'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 422 })))
    await expect(calculateShipping(input)).rejects.toThrow('Melhor Envio')
  })

  it('sem token configurado, lança antes de chamar a rede', async () => {
    delete process.env.MELHORENVIO_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(calculateShipping(input)).rejects.toThrow('MELHORENVIO_TOKEN')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
