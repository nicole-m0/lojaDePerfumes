import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  __clearShippingCache,
  quoteShippingForCart,
  resolveShippingSelection,
  ShippingUnavailableError,
  type ShippingDeps,
} from './shipping'
import type { ShippingItemInput, ShippingOption } from '@/lib/shipping/types'

const ORIG = { ...process.env }

beforeEach(() => {
  process.env.MELHORENVIO_TOKEN = 'tok'
  process.env.SHIPPING_ORIGIN_ZIP = '01001-000'
  __clearShippingCache()
})
afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
})

const items: ShippingItemInput[] = [
  { weightGrams: 300, heightCm: 6, widthCm: 11, lengthCm: 16, quantity: 2, unitPriceCents: 12990 },
]

const OPTIONS: ShippingOption[] = [
  { serviceCode: '1', serviceName: 'PAC', carrier: 'Correios', priceCents: 2340, deliveryDaysMin: 6, deliveryDaysMax: 8 },
  { serviceCode: '2', serviceName: 'SEDEX', carrier: 'Correios', priceCents: 3990, deliveryDaysMin: 2, deliveryDaysMax: 3 },
]

function deps(over: Partial<ShippingDeps> = {}): ShippingDeps {
  return {
    calculate: vi.fn().mockResolvedValue(OPTIONS),
    now: () => 1_000_000,
    ...over,
  }
}

describe('quoteShippingForCart', () => {
  it('cota e devolve origem, destino, pacote agregado e opções', async () => {
    const d = deps()
    const result = await quoteShippingForCart({ destZip: '20010-000', items }, d)

    expect(result.originZip).toBe('01001000')
    expect(result.destZip).toBe('20010000')
    expect(result.package.weightGrams).toBe(600)
    expect(result.options).toEqual(OPTIONS)
    expect(d.calculate).toHaveBeenCalledOnce()
    expect((d.calculate as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      originZip: '01001000',
      destZip: '20010000',
      declaredValueCents: 25980,
    })
  })

  it('reusa o cache dentro do TTL para a mesma origem/destino/pacote', async () => {
    const calculate = vi.fn().mockResolvedValue(OPTIONS)
    await quoteShippingForCart({ destZip: '20010-000', items }, deps({ calculate, now: () => 0 }))
    await quoteShippingForCart(
      { destZip: '20010-000', items },
      deps({ calculate, now: () => 5 * 60 * 1000 }),
    )
    expect(calculate).toHaveBeenCalledOnce()
  })

  it('recota depois que o TTL expira', async () => {
    const calculate = vi.fn().mockResolvedValue(OPTIONS)
    await quoteShippingForCart({ destZip: '20010-000', items }, deps({ calculate, now: () => 0 }))
    await quoteShippingForCart(
      { destZip: '20010-000', items },
      deps({ calculate, now: () => 11 * 60 * 1000 }),
    )
    expect(calculate).toHaveBeenCalledTimes(2)
  })

  it('skipCache força nova cotação mesmo dentro do TTL, e ainda popula o cache', async () => {
    const calculate = vi.fn().mockResolvedValue(OPTIONS)
    // 1ª cotação normal — grava no cache.
    await quoteShippingForCart({ destZip: '20010-000', items }, deps({ calculate, now: () => 0 }))
    // 2ª com skipCache dentro do TTL — ignora o cache e chama de novo.
    await quoteShippingForCart(
      { destZip: '20010-000', items, skipCache: true },
      deps({ calculate, now: () => 60_000 }),
    )
    expect(calculate).toHaveBeenCalledTimes(2)
    // 3ª normal dentro do TTL — reaproveita o cache atualizado pela 2ª.
    await quoteShippingForCart(
      { destZip: '20010-000', items },
      deps({ calculate, now: () => 120_000 }),
    )
    expect(calculate).toHaveBeenCalledTimes(2)
  })

  it('sem provedor configurado -> ShippingUnavailableError', async () => {
    delete process.env.MELHORENVIO_TOKEN
    await expect(quoteShippingForCart({ destZip: '20010-000', items }, deps())).rejects.toBeInstanceOf(
      ShippingUnavailableError,
    )
  })

  it('CEP de destino inválido -> ShippingUnavailableError', async () => {
    await expect(quoteShippingForCart({ destZip: '123', items }, deps())).rejects.toThrow(
      'CEP de destino inválido',
    )
  })

  it('falha da API vira ShippingUnavailableError (não vaza o erro cru)', async () => {
    const d = deps({ calculate: vi.fn().mockRejectedValue(new Error('ECONNRESET')) })
    await expect(quoteShippingForCart({ destZip: '20010-000', items }, d)).rejects.toThrow(
      'Não foi possível calcular o frete',
    )
  })

  it('nenhuma opção retornada -> ShippingUnavailableError', async () => {
    const d = deps({ calculate: vi.fn().mockResolvedValue([]) })
    await expect(quoteShippingForCart({ destZip: '20010-000', items }, d)).rejects.toThrow(
      'Nenhuma opção de frete',
    )
  })

  it('carrinho vazio -> ShippingUnavailableError', async () => {
    await expect(quoteShippingForCart({ destZip: '20010-000', items: [] }, deps())).rejects.toThrow(
      'sem itens',
    )
  })
})

describe('resolveShippingSelection', () => {
  const quote = {
    originZip: '01001000',
    destZip: '20010000',
    package: { weightGrams: 600, heightCm: 12, widthCm: 11, lengthCm: 16 },
    options: OPTIONS,
  }

  it('devolve a opção escolhida pelo serviceCode', () => {
    expect(resolveShippingSelection(quote, '2').serviceName).toBe('SEDEX')
  })

  it('serviceCode desconhecido -> ShippingUnavailableError', () => {
    expect(() => resolveShippingSelection(quote, '99')).toThrow(ShippingUnavailableError)
  })
})
