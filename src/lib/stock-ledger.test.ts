import { describe, expect, it } from 'vitest'
import {
  pendingReturnByProduct,
  quantitiesToDecrement,
  requiredQuantityByProduct,
  summarizeOrderStockLedger,
} from './stock'

const sale = (productId: string, quantity: number) => ({ productId, type: 'OUTBOUND', reason: 'SALE', quantity })
const ret = (productId: string, quantity: number, reason = 'OTHER') => ({ productId, type: 'RETURN', reason, quantity })

describe('summarizeOrderStockLedger', () => {
  it('soma saídas por venda e devoluções por produto', () => {
    const l = summarizeOrderStockLedger([sale('a', 3), sale('b', 1), ret('a', 1), ret('a', 1, 'CUSTOMER_RETURN')])
    expect(l.get('a')).toEqual({ out: 3, back: 2 })
    expect(l.get('b')).toEqual({ out: 1, back: 0 })
  })

  it('ignora movimentações que não são venda nem devolução (perda, ajuste, entrada)', () => {
    const l = summarizeOrderStockLedger([
      { productId: 'a', type: 'OUTBOUND', reason: 'LOSS', quantity: 5 },
      { productId: 'a', type: 'ADJUSTMENT', reason: 'MANUAL_ADJUSTMENT', quantity: 2 },
      { productId: 'a', type: 'INBOUND', reason: 'PURCHASE', quantity: 9 },
    ])
    expect(l.size).toBe(0)
  })
})

describe('requiredQuantityByProduct', () => {
  it('soma linhas repetidas do mesmo produto', () => {
    const r = requiredQuantityByProduct([
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
      { productId: 'a', quantity: 3 },
    ])
    expect([...r]).toEqual([
      ['a', 5],
      ['b', 1],
    ])
  })
})

describe('quantitiesToDecrement', () => {
  it('baixa só o que ainda não saiu, por produto', () => {
    const required = new Map([
      ['a', 5],
      ['b', 2],
    ])
    expect([...quantitiesToDecrement(required, new Map())]).toEqual([
      ['a', 5],
      ['b', 2],
    ])
    const partial = summarizeOrderStockLedger([sale('a', 5), sale('b', 1)])
    expect([...quantitiesToDecrement(required, partial)]).toEqual([['b', 1]])
    const all = summarizeOrderStockLedger([sale('a', 5), sale('b', 2)])
    expect(quantitiesToDecrement(required, all).size).toBe(0)
  })

  it('devoluções não reabrem a baixa (não baixa de novo o que voltou)', () => {
    const ledger = summarizeOrderStockLedger([sale('a', 2), ret('a', 2)])
    expect(quantitiesToDecrement(new Map([['a', 2]]), ledger).size).toBe(0)
  })
})

describe('pendingReturnByProduct', () => {
  it('pendente = saiu − voltou, por produto, só os positivos', () => {
    const ledger = summarizeOrderStockLedger([sale('a', 3), ret('a', 1), sale('b', 2), ret('b', 2), sale('c', 1)])
    expect([...pendingReturnByProduct(ledger)]).toEqual([
      ['a', 2],
      ['c', 1],
    ])
  })
})
