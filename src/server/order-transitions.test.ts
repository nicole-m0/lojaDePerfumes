import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakeOrderDb, type FakeOrderDb } from '@/test/fake-order-db'

vi.mock('server-only', () => ({}))
// As funções testadas só usam o `tx` recebido. O cliente global é um objeto vazio:
// qualquer uso acidental dele quebra o teste.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  cancelOrderInTx,
  changeOrderStatusInTx,
  OrderTransitionError,
  registerOrderReturnInTx,
} from '@/server/order-transitions'

let db: FakeOrderDb
const USER = 'user_staff'

const confirm = (orderId: string) =>
  db.$transaction((tx) =>
    changeOrderStatusInTx(tx, { orderId, toStatus: 'CONFIRMED', userId: USER, note: null }),
  )
const advance = (orderId: string, toStatus: 'PROCESSING' | 'SHIPPED' | 'DELIVERED') =>
  db.$transaction((tx) => changeOrderStatusInTx(tx, { orderId, toStatus, userId: USER, note: null }))
const cancel = (orderId: string) =>
  db.$transaction((tx) => cancelOrderInTx(tx, { orderId, reason: 'teste', userId: USER }))
const giveBack = (orderId: string, productId: string, quantity: number) =>
  db.$transaction((tx) =>
    registerOrderReturnInTx(tx, { orderId, productId, quantity, userId: USER, note: null }),
  )

const moves = (orderId: string, type: string) =>
  db.state.movements.filter((m) => m.orderId === orderId && m.type === type)
const sum = (list: { quantity: number }[]) => list.reduce((s, m) => s + m.quantity, 0)

beforeEach(() => {
  db = makeFakeOrderDb()
  db.seedProduct('p1', 10)
  db.seedProduct('p2', 5)
})

describe('confirmação (PENDING → CONFIRMED)', () => {
  it('baixa o estoque por produto, uma vez, e registra o responsável', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }] })
    await confirm(o.id)
    expect(db.stock('p1')).toBe(7)
    expect(db.stock('p2')).toBe(3)
    expect(db.order(o.id).status).toBe('CONFIRMED')
    const out = moves(o.id, 'OUTBOUND')
    expect(out).toHaveLength(2)
    expect(out.every((m) => m.reason === 'SALE' && m.userId === USER)).toBe(true)
    const ev = db.state.events.find((e) => e.orderId === o.id)!
    expect(ev).toMatchObject({ type: 'ORDER_STATUS_CHANGED', fromStatus: 'PENDING', toStatus: 'CONFIRMED', userId: USER })
  })

  it('soma linhas repetidas do mesmo produto numa única baixa', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }] })
    await confirm(o.id)
    expect(db.stock('p1')).toBe(5)
    expect(moves(o.id, 'OUTBOUND')).toHaveLength(1)
    expect(sum(moves(o.id, 'OUTBOUND'))).toBe(5)
  })

  it('linhas repetidas cuja soma passa do saldo: recusa e não baixa nada', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p2', quantity: 3 }, { productId: 'p2', quantity: 3 }] })
    await expect(confirm(o.id)).rejects.toBeInstanceOf(OrderTransitionError)
    expect(db.stock('p2')).toBe(5)
    expect(db.order(o.id).status).toBe('PENDING')
  })

  it('sem estoque de um item: desfaz tudo (nenhum produto baixado, status PENDING)', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 99 }] })
    await expect(confirm(o.id)).rejects.toThrow(/estoque insuficiente/)
    expect(db.stock('p1')).toBe(10)
    expect(db.stock('p2')).toBe(5)
    expect(db.order(o.id).status).toBe('PENDING')
    expect(db.state.movements).toHaveLength(0)
    expect(db.state.events).toHaveLength(0)
  })

  it('duas confirmações simultâneas: uma única baixa; a outra falha com mensagem clara', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 4 }] })
    const results = await Promise.allSettled([confirm(o.id), confirm(o.id)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(OrderTransitionError)
    expect(db.stock('p1')).toBe(6)
    expect(sum(moves(o.id, 'OUTBOUND'))).toBe(4)
    expect(db.stats.forUpdate).toBe(2)
  })

  it('pedido inexistente → erro de negócio', async () => {
    await expect(confirm('nope')).rejects.toThrow('Pedido não encontrado.')
  })

  it('transições posteriores (PROCESSING/SHIPPED/DELIVERED) não mexem no estoque', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 2 }] })
    await confirm(o.id)
    await advance(o.id, 'PROCESSING')
    await advance(o.id, 'SHIPPED')
    await advance(o.id, 'DELIVERED')
    expect(db.stock('p1')).toBe(8)
    expect(moves(o.id, 'OUTBOUND')).toHaveLength(1)
  })

  it('recusa CANCELED pela transição comum e transições fora da máquina de estados', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 1 }] })
    await expect(
      db.$transaction((tx) => changeOrderStatusInTx(tx, { orderId: o.id, toStatus: 'CANCELED', userId: USER, note: null })),
    ).rejects.toThrow(/cancelamento/)
    await expect(advance(o.id, 'SHIPPED')).rejects.toThrow(/não permitida/)
  })
})

describe('cancelamento', () => {
  it('a partir de PENDING ou DRAFT não mexe no estoque', async () => {
    const a = db.seedOrder({ status: 'PENDING', lines: [{ productId: 'p1', quantity: 2 }] })
    const b = db.seedOrder({ status: 'DRAFT', lines: [{ productId: 'p1', quantity: 2 }] })
    await cancel(a.id)
    await cancel(b.id)
    expect(db.stock('p1')).toBe(10)
    expect(db.state.movements).toHaveLength(0)
  })

  it.each(['CONFIRMED', 'PROCESSING'] as const)('a partir de %s devolve, por produto, o que saiu', async (at) => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1 }] })
    await confirm(o.id)
    if (at === 'PROCESSING') await advance(o.id, 'PROCESSING')
    await cancel(o.id)
    expect(db.stock('p1')).toBe(10)
    expect(db.stock('p2')).toBe(5)
    expect(sum(moves(o.id, 'RETURN'))).toBe(4)
    expect(moves(o.id, 'RETURN').every((m) => m.userId === USER)).toBe(true)
    expect(db.order(o.id).status).toBe('CANCELED')
  })

  it('dois cancelamentos simultâneos: uma única devolução', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 3 }] })
    await confirm(o.id)
    const results = await Promise.allSettled([cancel(o.id), cancel(o.id)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(db.stock('p1')).toBe(10)
    expect(sum(moves(o.id, 'RETURN'))).toBe(3)
  })

  it('confirmação e cancelamento simultâneos terminam em estado coerente', async () => {
    for (let run = 0; run < 10; run++) {
      db = makeFakeOrderDb()
      db.seedProduct('p1', 10)
      const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 4 }] })
      await Promise.allSettled(run % 2 ? [confirm(o.id), cancel(o.id)] : [cancel(o.id), confirm(o.id)])
      const status = db.order(o.id).status
      const net = sum(moves(o.id, 'OUTBOUND')) - sum(moves(o.id, 'RETURN'))
      if (status === 'CONFIRMED') expect(db.stock('p1')).toBe(6)
      else {
        expect(status).toBe('CANCELED')
        expect(db.stock('p1')).toBe(10)
        expect(net).toBe(0)
      }
    }
  })

  it('a partir de SHIPPED NÃO devolve e registra o pendente no histórico', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 3, productName: 'Perfume A' }] })
    await confirm(o.id)
    await advance(o.id, 'PROCESSING')
    await advance(o.id, 'SHIPPED')
    const r = await cancel(o.id)
    expect(r.awaitingReturn).toBe(true)
    expect(db.stock('p1')).toBe(7)
    expect(moves(o.id, 'RETURN')).toHaveLength(0)
    const ev = db.state.events.at(-1)!
    expect(ev.toStatus).toBe('CANCELED')
    expect(ev.note).toMatch(/NÃO devolvido.*3 un\. de Perfume A/)
  })

  it('recusa cancelar pedido já cancelado ou entregue', async () => {
    const a = db.seedOrder({ status: 'CANCELED', lines: [{ productId: 'p1', quantity: 1 }] })
    const b = db.seedOrder({ status: 'DELIVERED', lines: [{ productId: 'p1', quantity: 1 }] })
    await expect(cancel(a.id)).rejects.toThrow(/já está cancelado/)
    await expect(cancel(b.id)).rejects.toThrow(/não pode mais ser cancelado/)
  })
})

describe('retorno físico', () => {
  async function shippedThenCanceled(lines: { productId: string; quantity: number }[]) {
    const o = db.seedOrder({ lines })
    await confirm(o.id)
    await advance(o.id, 'PROCESSING')
    await advance(o.id, 'SHIPPED')
    await cancel(o.id)
    return o
  }

  it('parcial, por produto, até o pendente; o excedente é recusado', async () => {
    const o = await shippedThenCanceled([{ productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 2 }])
    expect(db.stock('p1')).toBe(7)
    await giveBack(o.id, 'p1', 1)
    expect(db.stock('p1')).toBe(8)
    await giveBack(o.id, 'p1', 2)
    expect(db.stock('p1')).toBe(10)
    await expect(giveBack(o.id, 'p1', 1)).rejects.toThrow(/pendentes de retorno/)
    // p2 continua pendente e independente de p1
    await expect(giveBack(o.id, 'p2', 3)).rejects.toThrow(/maior que a pendente/)
    await giveBack(o.id, 'p2', 2)
    expect(db.stock('p2')).toBe(5)
    const returns = moves(o.id, 'RETURN')
    expect(returns.every((m) => m.reason === 'CUSTOMER_RETURN' && m.userId === USER)).toBe(true)
    const notes = db.state.events.filter((e) => e.type === 'NOTE')
    expect(notes).toHaveLength(3)
    expect(notes.every((e) => e.userId === USER)).toBe(true)
  })

  it('registros simultâneos que somam mais que o pendente: só o que cabe entra', async () => {
    const o = await shippedThenCanceled([{ productId: 'p1', quantity: 3 }])
    const results = await Promise.allSettled([giveBack(o.id, 'p1', 2), giveBack(o.id, 'p1', 2)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(db.stock('p1')).toBe(9)
    expect(sum(moves(o.id, 'RETURN'))).toBe(2)
  })

  it('pedido entregue também aceita retorno (devolução do cliente)', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 2 }] })
    await confirm(o.id)
    await advance(o.id, 'PROCESSING')
    await advance(o.id, 'SHIPPED')
    await advance(o.id, 'DELIVERED')
    await giveBack(o.id, 'p1', 1)
    expect(db.stock('p1')).toBe(9)
    expect(db.order(o.id).status).toBe('DELIVERED')
  })

  it('cancelado antes do envio: nada pendente (já devolvido automaticamente)', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 2 }] })
    await confirm(o.id)
    await cancel(o.id)
    await expect(giveBack(o.id, 'p1', 1)).rejects.toThrow(/pendentes de retorno/)
    expect(db.stock('p1')).toBe(10)
  })

  it('recusa pedido em andamento, produto fora do pedido e quantidade inválida', async () => {
    const o = db.seedOrder({ lines: [{ productId: 'p1', quantity: 2 }] })
    await confirm(o.id)
    await expect(giveBack(o.id, 'p1', 1)).rejects.toThrow(/cancelados após o envio ou entregues/)
    await advance(o.id, 'PROCESSING')
    await advance(o.id, 'SHIPPED')
    await cancel(o.id)
    await expect(giveBack(o.id, 'p2', 1)).rejects.toThrow(/não faz parte/)
    await expect(giveBack(o.id, 'p1', 0)).rejects.toThrow(/maior que zero/)
    await expect(giveBack(o.id, 'p1', 1.5)).rejects.toThrow(/maior que zero/)
  })
})
