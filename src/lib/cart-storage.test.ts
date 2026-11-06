import { describe, expect, it } from 'vitest'
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEYS,
  loadCart,
  parseStoredCart,
  saveCart,
  type StorageLike,
} from './cart-storage'

const LEGACY = LEGACY_CART_STORAGE_KEYS[0]

function memoryStorage(initial: Record<string, string> = {}, opts: { failWrites?: boolean } = {}) {
  const data = new Map(Object.entries(initial))
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failWrites) throw new Error('QuotaExceededError')
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
  return { storage, data }
}

const item = (id: string, quantity = 1) => ({
  product: { id, slug: id, name: `Produto ${id}`, price: 10 },
  quantity,
})

describe('loadCart — migração da chave antiga', () => {
  it('migra o carrinho legado para a chave nova e só então remove a antiga', () => {
    const legacyCart = [item('a', 2)]
    const { storage, data } = memoryStorage({ [LEGACY]: JSON.stringify(legacyCart) })

    const loaded = loadCart(storage)

    expect(loaded).toEqual(legacyCart)
    expect(JSON.parse(data.get(CART_STORAGE_KEY)!)).toEqual(legacyCart)
    expect(data.has(LEGACY)).toBe(false)
  })

  it('se a gravação falhar, devolve o carrinho e NÃO apaga a chave antiga', () => {
    const legacyCart = [item('a')]
    const { storage, data } = memoryStorage(
      { [LEGACY]: JSON.stringify(legacyCart) },
      { failWrites: true },
    )

    expect(loadCart(storage)).toEqual(legacyCart)
    expect(data.has(LEGACY)).toBe(true)
  })

  it('a chave nova tem prioridade sobre a antiga', () => {
    const { storage, data } = memoryStorage({
      [CART_STORAGE_KEY]: JSON.stringify([item('novo')]),
      [LEGACY]: JSON.stringify([item('antigo')]),
    })
    expect(loadCart(storage).map((i) => i.product.id)).toEqual(['novo'])
    expect(data.has(LEGACY)).toBe(true) // não mexe no que não precisa
  })

  it('carrinho vazio quando não há nada salvo', () => {
    expect(loadCart(memoryStorage().storage)).toEqual([])
  })

  it('JSON corrompido na chave antiga não quebra nem é migrado', () => {
    const { storage, data } = memoryStorage({ [LEGACY]: '{quebrado' })
    expect(loadCart(storage)).toEqual([])
    expect(data.has(CART_STORAGE_KEY)).toBe(false)
  })
})

describe('parseStoredCart', () => {
  it('descarta entradas malformadas e mantém as válidas', () => {
    const raw = JSON.stringify([
      item('ok', 1),
      { quantity: 1 },
      item('zero', 0),
      item('frac', 1.5),
      null,
    ])
    expect(parseStoredCart(raw)!.map((i) => i.product.id)).toEqual(['ok'])
  })

  it('não-array vira null', () => {
    expect(parseStoredCart('{"a":1}')).toBeNull()
    expect(parseStoredCart(null)).toBeNull()
  })
})

describe('saveCart', () => {
  it('grava sempre na chave nova', () => {
    const { storage, data } = memoryStorage()
    saveCart(storage, [item('a')] as never)
    expect(data.has(CART_STORAGE_KEY)).toBe(true)
    expect(data.has(LEGACY)).toBe(false)
  })

  it('não lança se o storage recusar a escrita', () => {
    const { storage } = memoryStorage({}, { failWrites: true })
    expect(() => saveCart(storage, [])).not.toThrow()
  })
})
