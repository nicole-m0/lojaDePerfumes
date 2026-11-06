import { describe, expect, it } from 'vitest'
import {
  buildDemoShippingOption,
  DEFAULT_DEMO_FLAT_RATE_CENTS,
  DEMO_SERVICE_CODE,
  DEMO_SHIPPING_ADMIN_NOTICE,
  DEMO_SHIPPING_NOTICE,
  demoOptionDetail,
  formatDeliveryWindow,
  getDemoFlatRateCents,
  isDemoShippingEnabled,
  isDemoShippingProvider,
} from './demo'

describe('isDemoShippingEnabled', () => {
  it('liga só com SHIPPING_DEMO_MODE="true"', () => {
    expect(isDemoShippingEnabled({ SHIPPING_DEMO_MODE: 'true' })).toBe(true)
  })

  it.each([undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true'])(
    'fica desligado com %j',
    (value) => {
      expect(isDemoShippingEnabled({ SHIPPING_DEMO_MODE: value })).toBe(false)
    },
  )
})

describe('getDemoFlatRateCents', () => {
  it('usa R$ 19,90 quando não configurado', () => {
    expect(getDemoFlatRateCents({})).toBe(1990)
    expect(DEFAULT_DEMO_FLAT_RATE_CENTS).toBe(1990)
  })

  it('aceita inteiro em centavos, inclusive zero', () => {
    expect(getDemoFlatRateCents({ SHIPPING_DEMO_FLAT_CENTS: '2500' })).toBe(2500)
    expect(getDemoFlatRateCents({ SHIPPING_DEMO_FLAT_CENTS: ' 0 ' })).toBe(0)
  })

  it.each(['-100', '19.90', '19,90', 'abc', '100001', '1e3'])(
    'valor inválido %j cai no padrão',
    (value) => {
      expect(getDemoFlatRateCents({ SHIPPING_DEMO_FLAT_CENTS: value })).toBe(1990)
    },
  )
})

describe('buildDemoShippingOption', () => {
  it('monta a opção simulada única, marcada como simulated', () => {
    expect(buildDemoShippingOption(1990)).toEqual({
      serviceCode: DEMO_SERVICE_CODE,
      serviceName: 'Frete simulado',
      carrier: 'Demonstração',
      priceCents: 1990,
      deliveryDaysMin: 5,
      deliveryDaysMax: 8,
      simulated: true,
    })
  })
})

describe('isDemoShippingProvider', () => {
  it('reconhece apenas "demo"', () => {
    expect(isDemoShippingProvider('demo')).toBe(true)
    expect(isDemoShippingProvider('melhorenvio')).toBe(false)
    expect(isDemoShippingProvider(null)).toBe(false)
    expect(isDemoShippingProvider(undefined)).toBe(false)
  })
})

describe('textos', () => {
  it('formatDeliveryWindow', () => {
    expect(formatDeliveryWindow(5, 8)).toBe('5–8 dias úteis')
    expect(formatDeliveryWindow(3, 3)).toBe('3 dias úteis')
    expect(formatDeliveryWindow(null, 4)).toBe('4 dias úteis')
    expect(formatDeliveryWindow(2, null)).toBeNull()
  })

  it('detalhe da opção deixa prazo e valor explicitamente fictícios', () => {
    const text = demoOptionDetail({ deliveryDaysMin: 5, deliveryDaysMax: 8 })
    expect(text).toContain('Prazo fictício de 5–8 dias úteis')
    expect(text).toContain('valor fictício')
    expect(text).toContain('nenhum envio real')
  })

  it('avisos citam simulação, valor e prazo fictícios', () => {
    for (const notice of [DEMO_SHIPPING_NOTICE, DEMO_SHIPPING_ADMIN_NOTICE]) {
      expect(notice).toMatch(/simulado/i)
      expect(notice).toMatch(/valor e prazo fictícios/i)
    }
  })
})
