import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Testes de integração do serviço central de pagamentos.
//
// Não batem no PostgreSQL real (o CI não tem DATABASE_URL e não se deve mexer no
// banco compartilhado). No lugar, um fake do Prisma modela o subconjunto usado por
// `src/server/payments.ts` com fidelidade suficiente para exercitar a orquestração
// completa: transação, rollback em erro, escrita de Payment/OrderEvent e a
// resincronização de Order.paymentStatus via summarizePayments.
//
// O fake também modela `SELECT … FOR UPDATE` como um mutex global por instância: uma
// segunda transação que peça o lock enquanto outra o mantém fica bloqueada até a
// primeira terminar — é isso que impede o overpayment concorrente. Se `lockOrder`
// for removido de payments.ts, os testes de concorrência abaixo passam a falhar.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

interface Row {
  [k: string]: unknown
}

function makeFakePrisma() {
  const orders: Row[] = []
  const payments: Row[] = []
  const orderEvents: Row[] = []
  let seq = 0
  const nid = (p: string) => `${p}_${++seq}`

  // Mutex global — modela o lock de linha do Order (`FOR UPDATE`).
  let lockHolder: Promise<void> | null = null

  function makeTx() {
    const undo: (() => void)[] = []
    let release: (() => void) | null = null

    return {
      async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
        const sql = strings.join('?')
        if (/for update/i.test(sql)) {
          while (lockHolder) await lockHolder
          lockHolder = new Promise<void>((resolve) => {
            release = () => {
              lockHolder = null
              release = null
              resolve()
            }
          })
        }
        const orderId = values[0]
        return orders.some((o) => o.id === orderId) ? [{ id: orderId }] : []
      },
      order: {
        async findUnique({ where, select }: { where: { id: string }; select?: Row }) {
          const o = orders.find((x) => x.id === where.id)
          if (!o) return null
          const r: Row = { ...o }
          if (select?.payments) {
            r.payments = payments.filter((p) => p.orderId === o.id).map((p) => ({ ...p }))
          }
          return r
        },
        async update({ where, data }: { where: { id: string }; data: Row }) {
          const o = orders.find((x) => x.id === where.id)
          if (!o) throw new Error('order not found')
          const prev = { ...o }
          Object.assign(o, data)
          undo.push(() => Object.assign(o, prev))
          return { ...o }
        },
      },
      payment: {
        async create({ data }: { data: Row }) {
          const row: Row = { id: nid('pay'), paidAt: null, createdAt: new Date(), notes: null, ...data }
          payments.push(row)
          undo.push(() => {
            const i = payments.indexOf(row)
            if (i >= 0) payments.splice(i, 1)
          })
          return { ...row }
        },
        async update({ where, data }: { where: { id: string }; data: Row }) {
          const p = payments.find((x) => x.id === where.id)
          if (!p) throw new Error('payment not found')
          const prev = { ...p }
          Object.assign(p, data)
          undo.push(() => Object.assign(p, prev))
          return { ...p }
        },
      },
      orderEvent: {
        async create({ data }: { data: Row }) {
          const row: Row = {
            id: nid('evt'),
            createdAt: new Date(),
            fromStatus: null,
            toStatus: null,
            note: null,
            userId: null,
            ...data,
          }
          orderEvents.push(row)
          undo.push(() => {
            const i = orderEvents.indexOf(row)
            if (i >= 0) orderEvents.splice(i, 1)
          })
          return { ...row }
        },
      },
      _rollback() {
        while (undo.length) undo.pop()!()
      },
      _release() {
        if (release) release()
      },
    }
  }

  return {
    _state: { orders, payments, orderEvents },
    seedOrder(o: Row = {}) {
      const row: Row = { id: nid('ord'), totalCents: 10000, paymentStatus: 'PENDING', ...o }
      orders.push(row)
      return row
    },
    seedPayment(p: Row) {
      const row: Row = {
        id: nid('pay'),
        status: 'PENDING',
        method: 'PIX',
        paidAt: null,
        createdAt: new Date(),
        notes: null,
        ...p,
      }
      payments.push(row)
      return row
    },
    async $transaction<T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>): Promise<T> {
      const tx = makeTx()
      try {
        return await fn(tx)
      } catch (err) {
        tx._rollback()
        throw err
      } finally {
        tx._release()
      }
    },
  }
}

type FakePrisma = ReturnType<typeof makeFakePrisma>

const h = vi.hoisted(() => ({ fake: null as unknown as FakePrisma }))

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop === 'symbol') return undefined
        return (h.fake as unknown as Row)[prop]
      },
    },
  ),
}))

// Import AFTER the mocks are registered.
import {
  createManualPayment,
  transitionPaymentStatus,
  PaymentServiceError,
} from '@/server/payments'

const staff = { id: 'user_1', email: 'admin@test' } as never

function eventsFor(orderId: string) {
  return h.fake._state.orderEvents.filter((e) => e.orderId === orderId)
}
function orderById(id: string) {
  return h.fake._state.orders.find((o) => o.id === id)!
}
function paidSum(orderId: string) {
  return h.fake._state.payments
    .filter((p) => p.orderId === orderId && p.status === 'PAID')
    .reduce((s, p) => s + (p.amountCents as number), 0)
}

beforeEach(() => {
  h.fake = makeFakePrisma()
})

// ---------------------------------------------------------------------------
describe('createManualPayment', () => {
  it('cria Payment PENDING, registra OrderEvent e mantém Order.paymentStatus', async () => {
    const order = order10k()
    const p = await createManualPayment({
      orderId: order.id as string,
      method: 'PIX' as never,
      amountCents: 4000,
      notes: 'sinal',
      staff,
    })

    expect(p.status).toBe('PENDING')
    expect(p.amountCents).toBe(4000)
    expect(h.fake._state.payments).toHaveLength(1)

    const events = eventsFor(order.id as string)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'PAYMENT_STATUS_CHANGED',
      fromStatus: null,
      toStatus: 'PENDING',
      userId: 'user_1',
    })

    expect(orderById(order.id as string).paymentStatus).toBe('PENDING')
  })

  it('rejeita valor menor ou igual a zero sem abrir transação', async () => {
    const order = order10k()
    await expect(
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 0, notes: null, staff }),
    ).rejects.toBeInstanceOf(PaymentServiceError)
    expect(h.fake._state.payments).toHaveLength(0)
  })

  it('rejeita pedido inexistente', async () => {
    await expect(
      createManualPayment({ orderId: 'nope', method: 'PIX' as never, amountCents: 100, notes: null, staff }),
    ).rejects.toThrow('Pedido não encontrado.')
  })

  it('bloqueia valor acima do total do pedido', async () => {
    const order = order10k()
    await expect(
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 10001, notes: null, staff }),
    ).rejects.toBeInstanceOf(PaymentServiceError)
    expect(h.fake._state.payments).toHaveLength(0)
    expect(eventsFor(order.id as string)).toHaveLength(0)
  })

  it('bloqueia valor que, somado ao já PAGO, passaria do total', async () => {
    const order = order10k()
    h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 6000 })
    await expect(
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 5000, notes: null, staff }),
    ).rejects.toBeInstanceOf(PaymentServiceError)
  })

  it('bloqueia valor que, somado ao já PENDENTE, passaria do total (pendência fantasma)', async () => {
    const order = order10k()
    h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 7000 })
    await expect(
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 4000, notes: null, staff }),
    ).rejects.toThrow(/não coberto por pagamentos registrados/)
    // 3000 ainda cabe (7000 pendente + 3000 = 10000)
    const p = await createManualPayment({
      orderId: order.id as string,
      method: 'PIX' as never,
      amountCents: 3000,
      notes: null,
      staff,
    })
    expect(p.status).toBe('PENDING')
  })

  it('aceita valor exatamente igual ao disponível', async () => {
    const order = order10k()
    const p = await createManualPayment({
      orderId: order.id as string,
      method: 'BOLETO' as never,
      amountCents: 10000,
      notes: null,
      staff,
    })
    expect(p.amountCents).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
describe('transitionPaymentStatus — máquina de estados', () => {
  it('PENDING → PAID: seta paidAt, sincroniza Order.paymentStatus e grava OrderEvent', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 10000 })

    const updated = await transitionPaymentStatus({
      orderId: order.id as string,
      paymentId: pay.id as string,
      toStatus: 'PAID',
      note: 'confirmado no extrato',
      staff,
    })

    expect(updated.status).toBe('PAID')
    expect(updated.paidAt).toBeInstanceOf(Date)
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')

    const events = eventsFor(order.id as string)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'PAYMENT_STATUS_CHANGED', fromStatus: 'PENDING', toStatus: 'PAID' })
  })

  it('PENDING → FAILED → PENDING (reativação) é permitido', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 5000 })

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'FAILED', note: null, staff })
    expect(h.fake._state.payments[0].status).toBe('FAILED')

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'PENDING', note: null, staff })
    expect(h.fake._state.payments[0].status).toBe('PENDING')
  })

  it.each([
    ['PENDING', 'REFUNDED'],
    ['PENDING', 'CHARGEBACK'],
    ['PAID', 'PENDING'],
    ['PAID', 'FAILED'],
    ['CANCELED', 'PAID'],
    ['REFUNDED', 'PAID'],
  ] as const)('rejeita transição inválida %s → %s', async (from, to) => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: from, amountCents: 10000 })
    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: to, note: null, staff }),
    ).rejects.toThrow(/não permitida/)
    expect(h.fake._state.payments[0].status).toBe(from)
    expect(eventsFor(order.id as string)).toHaveLength(0)
  })

  it('rejeita transição para o mesmo status', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 100 })
    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'PENDING', note: null, staff }),
    ).rejects.toThrow('O pagamento já está nesse status.')
  })

  it('rejeita paymentId que não pertence ao pedido', async () => {
    const order = order10k()
    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: 'ghost', toStatus: 'PAID', note: null, staff }),
    ).rejects.toThrow('Pagamento não encontrado para este pedido.')
  })

  it('rejeita PAID quando somado a outro PAID excederia o total, sem gravar nada', async () => {
    const order = order10k()
    h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 6000 })
    const pend = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 5000 })

    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: pend.id as string, toStatus: 'PAID', note: null, staff }),
    ).rejects.toThrow(/excederia o total/)

    expect(h.fake._state.payments.find((p) => p.id === pend.id)!.status).toBe('PENDING')
    expect(eventsFor(order.id as string)).toHaveLength(0) // rollback: nenhum evento
    // A transição rejeitada não pode ter tocado Order.paymentStatus (continua como semeado).
    expect(orderById(order.id as string).paymentStatus).toBe('PENDING')
  })
})

// ---------------------------------------------------------------------------
describe('transitionPaymentStatus — sincronização de Order.paymentStatus', () => {
  it('pagamento parcial: um de dois PENDING vira PAID → PARTIALLY_PAID; o segundo → PAID', async () => {
    const order = order10k()
    const a = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 4000 })
    const b = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 6000 })

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: a.id as string, toStatus: 'PAID', note: null, staff })
    expect(orderById(order.id as string).paymentStatus).toBe('PARTIALLY_PAID')

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: b.id as string, toStatus: 'PAID', note: null, staff })
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')
    expect(paidSum(order.id as string)).toBe(10000)
  })

  it('PAID → REFUNDED sincroniza Order.paymentStatus para REFUNDED e fica terminal', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 10000, paidAt: new Date() })

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'REFUNDED', note: null, staff })
    expect(h.fake._state.payments[0].status).toBe('REFUNDED')
    expect(orderById(order.id as string).paymentStatus).toBe('REFUNDED')

    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'PAID', note: null, staff }),
    ).rejects.toThrow(/não permitida/)
  })

  it('PAID → CHARGEBACK sincroniza Order.paymentStatus para CHARGEBACK', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 10000, paidAt: new Date() })

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'CHARGEBACK', note: null, staff })
    expect(orderById(order.id as string).paymentStatus).toBe('CHARGEBACK')
  })
})

// ---------------------------------------------------------------------------
describe('concorrência — lock de linha do Order (FOR UPDATE)', () => {
  it('duas criações simultâneas não deixam o total registrado passar de Order.totalCents', async () => {
    const order = order10k()

    const results = await Promise.allSettled([
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 6000, notes: null, staff }),
      createManualPayment({ orderId: order.id as string, method: 'PIX' as never, amountCents: 6000, notes: null, staff }),
    ])

    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(PaymentServiceError)

    expect(h.fake._state.payments).toHaveLength(1)
    const registered = h.fake._state.payments.reduce((s, p) => s + (p.amountCents as number), 0)
    expect(registered).toBeLessThanOrEqual(10000)
  })

  it('duas confirmações simultâneas para PAID não ultrapassam Order.totalCents', async () => {
    const order = order10k()
    // Estado alcançável na prática via FAILED → PENDING (reativação) de um pagamento antigo.
    const a = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 10000 })
    const b = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 10000 })

    const results = await Promise.allSettled([
      transitionPaymentStatus({ orderId: order.id as string, paymentId: a.id as string, toStatus: 'PAID', note: null, staff }),
      transitionPaymentStatus({ orderId: order.id as string, paymentId: b.id as string, toStatus: 'PAID', note: null, staff }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)

    expect(paidSum(order.id as string)).toBeLessThanOrEqual(10000)
    expect(h.fake._state.payments.filter((p) => p.status === 'PAID')).toHaveLength(1)
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')
  })
})

// ---------------------------------------------------------------------------
function order10k() {
  return h.fake.seedOrder({ totalCents: 10000, paymentStatus: 'PENDING' })
}
