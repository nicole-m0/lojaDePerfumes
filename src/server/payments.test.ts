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

import { makeFakePrisma, type FakePrisma, type Row } from '@/test/fake-prisma'

vi.mock('server-only', () => ({}))

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
  applyGatewayPaymentUpdate,
  PaymentServiceError,
} from '@/server/payments'

const staff = { id: 'user_1', email: 'admin@test' } as never
// staff comum (sem OWNER) e OWNER — para o gate de REFUNDED/CHARGEBACK.
const owner = { id: 'user_owner', email: 'owner@test', role: 'OWNER' } as never

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

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'REFUNDED', note: null, staff: owner })
    expect(h.fake._state.payments[0].status).toBe('REFUNDED')
    expect(orderById(order.id as string).paymentStatus).toBe('REFUNDED')

    await expect(
      transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'PAID', note: null, staff }),
    ).rejects.toThrow(/não permitida/)
  })

  it('PAID → CHARGEBACK sincroniza Order.paymentStatus para CHARGEBACK', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 10000, paidAt: new Date() })

    await transitionPaymentStatus({ orderId: order.id as string, paymentId: pay.id as string, toStatus: 'CHARGEBACK', note: null, staff: owner })
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
describe('transitionPaymentStatus — gate OWNER para REFUNDED/CHARGEBACK', () => {
  it.each(['REFUNDED', 'CHARGEBACK'] as const)(
    'staff comum NÃO consegue %s pelo caminho manual (nada é gravado)',
    async (to) => {
      const order = order10k()
      const pay = h.fake.seedPayment({
        orderId: order.id,
        status: 'PAID',
        amountCents: 10000,
        paidAt: new Date(),
      })

      await expect(
        transitionPaymentStatus({
          orderId: order.id as string,
          paymentId: pay.id as string,
          toStatus: to,
          note: null,
          staff,
        }),
      ).rejects.toThrow(/OWNER/)

      expect(h.fake._state.payments[0].status).toBe('PAID')
      expect(eventsFor(order.id as string)).toHaveLength(0)
      expect(orderById(order.id as string).paymentStatus).toBe('PENDING')
    },
  )

  it.each(['REFUNDED', 'CHARGEBACK'] as const)('OWNER consegue %s', async (to) => {
    const order = order10k()
    const pay = h.fake.seedPayment({
      orderId: order.id,
      status: 'PAID',
      amountCents: 10000,
      paidAt: new Date(),
    })

    const updated = await transitionPaymentStatus({
      orderId: order.id as string,
      paymentId: pay.id as string,
      toStatus: to,
      note: null,
      staff: owner,
    })

    expect(updated.status).toBe(to)
    expect(orderById(order.id as string).paymentStatus).toBe(to)
  })

  it('transição inválida é barrada ANTES do gate (mensagem "não permitida")', async () => {
    const order = order10k()
    const pay = h.fake.seedPayment({ orderId: order.id, status: 'PENDING', amountCents: 10000 })
    await expect(
      transitionPaymentStatus({
        orderId: order.id as string,
        paymentId: pay.id as string,
        toStatus: 'REFUNDED',
        note: null,
        staff,
      }),
    ).rejects.toThrow(/não permitida/)
  })
})

// ---------------------------------------------------------------------------
describe('applyGatewayPaymentUpdate — atualização vinda do Mercado Pago', () => {
  const mp = (over: Record<string, unknown>) => ({
    orderId: '',
    provider: 'mercadopago',
    providerPaymentId: 'mp_1',
    rawStatus: 'approved',
    mappedStatus: 'PAID' as never,
    amountCents: 10000,
    method: 'CREDIT_CARD' as never,
    ...over,
  })

  function mpPayments(orderId: string) {
    return h.fake._state.payments.filter((p) => p.orderId === orderId)
  }

  it('approved, pagamento novo → cria Payment PAID e sincroniza Order.paymentStatus', async () => {
    const order = order10k()
    const r = await applyGatewayPaymentUpdate(mp({ orderId: order.id, rawStatus: 'approved', mappedStatus: 'PAID' }))

    expect(r.outcome).toBe('applied')
    expect(r.paymentStatus).toBe('PAID')
    const pays = mpPayments(order.id as string)
    expect(pays).toHaveLength(1)
    expect(pays[0]).toMatchObject({
      status: 'PAID',
      provider: 'mercadopago',
      providerPaymentId: 'mp_1',
      providerStatus: 'approved',
    })
    expect(pays[0].paidAt).toBeInstanceOf(Date)
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')
    const evts = eventsFor(order.id as string)
    expect(evts.some((e) => e.type === 'PAYMENT_STATUS_CHANGED' && e.toStatus === 'PAID')).toBe(true)
  })

  it('pending / in_process → cria Payment PENDING', async () => {
    const order = order10k()
    const r = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'pending', mappedStatus: 'PENDING' }),
    )
    expect(r.paymentStatus).toBe('PENDING')
    expect(mpPayments(order.id as string)[0].status).toBe('PENDING')
  })

  it('rejected / cancelled → cria Payment FAILED, pedido segue PENDING', async () => {
    const order = order10k()
    await applyGatewayPaymentUpdate(mp({ orderId: order.id, rawStatus: 'rejected', mappedStatus: 'FAILED' }))
    expect(mpPayments(order.id as string)[0].status).toBe('FAILED')
    expect(orderById(order.id as string).paymentStatus).toBe('PENDING')
  })

  it('status desconhecido → não altera estado (Payment nasce PENDING, evento de nota)', async () => {
    const order = order10k()
    const r = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'in_mediation', mappedStatus: null }),
    )
    expect(r.outcome).toBe('noop')
    expect(mpPayments(order.id as string)[0].status).toBe('PENDING')
    expect(mpPayments(order.id as string)[0].providerStatus).toBe('in_mediation')
  })

  it('refunded (pagamento novo) → NÃO aplica REFUNDED: fica PAID + sinaliza OWNER', async () => {
    const order = order10k()
    const r = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'refunded', mappedStatus: 'REFUNDED' }),
    )
    expect(r.outcome).toBe('owner_action_required')
    const pay = mpPayments(order.id as string)[0]
    expect(pay.status).toBe('PAID')
    expect(pay.providerStatus).toBe('refunded')
    const notes = eventsFor(order.id as string).filter((e) => e.type === 'NOTE')
    expect(notes.some((n) => /OWNER/.test(String(n.note)))).toBe(true)
  })

  it('charged_back (pagamento novo) → NÃO aplica CHARGEBACK: fica PAID + sinaliza OWNER', async () => {
    const order = order10k()
    const r = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'charged_back', mappedStatus: 'CHARGEBACK' }),
    )
    expect(r.outcome).toBe('owner_action_required')
    expect(mpPayments(order.id as string)[0].status).toBe('PAID')
  })

  it('notificação repetida é idempotente (mesmo providerStatus → nenhum efeito novo)', async () => {
    const order = order10k()
    h.fake.seedPayment({
      orderId: order.id,
      status: 'PAID',
      amountCents: 10000,
      paidAt: new Date(),
      provider: 'mercadopago',
      providerPaymentId: 'mp_1',
      providerStatus: 'approved',
    })
    orderById(order.id as string).paymentStatus = 'PAID'
    const before = eventsFor(order.id as string).length

    const r = await applyGatewayPaymentUpdate(mp({ orderId: order.id, rawStatus: 'approved', mappedStatus: 'PAID' }))

    expect(r.outcome).toBe('noop')
    expect(eventsFor(order.id as string).length).toBe(before)
    expect(h.fake._state.payments).toHaveLength(1)
  })

  it('pagamento MP existente PENDING → approved: transiciona para PAID pela lógica central', async () => {
    const order = order10k()
    h.fake.seedPayment({
      orderId: order.id,
      status: 'PENDING',
      amountCents: 10000,
      provider: 'mercadopago',
      providerPaymentId: 'mp_1',
      providerStatus: 'pending',
    })

    const r = await applyGatewayPaymentUpdate(mp({ orderId: order.id, rawStatus: 'approved', mappedStatus: 'PAID' }))

    expect(r.outcome).toBe('applied')
    expect(h.fake._state.payments[0].status).toBe('PAID')
    expect(h.fake._state.payments[0].providerStatus).toBe('approved')
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')
  })

  it('pagamento MP existente PAID → refunded: mantém PAID, sinaliza OWNER, e repetição não duplica nota', async () => {
    const order = order10k()
    h.fake.seedPayment({
      orderId: order.id,
      status: 'PAID',
      amountCents: 10000,
      paidAt: new Date(),
      provider: 'mercadopago',
      providerPaymentId: 'mp_1',
      providerStatus: 'approved',
    })
    orderById(order.id as string).paymentStatus = 'PAID'

    const r1 = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'refunded', mappedStatus: 'REFUNDED' }),
    )
    expect(r1.outcome).toBe('owner_action_required')
    expect(h.fake._state.payments[0].status).toBe('PAID')
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')

    const notesAfter1 = eventsFor(order.id as string).filter((e) => e.type === 'NOTE').length

    const r2 = await applyGatewayPaymentUpdate(
      mp({ orderId: order.id, rawStatus: 'refunded', mappedStatus: 'REFUNDED' }),
    )
    expect(r2.outcome).toBe('noop') // já registrado (providerStatus == 'refunded')
    expect(eventsFor(order.id as string).filter((e) => e.type === 'NOTE').length).toBe(notesAfter1)
  })

  it('confirmação MP que excederia o total (já há pagamento manual) → registra PENDENTE e sinaliza conflito', async () => {
    const order = order10k()
    h.fake.seedPayment({ orderId: order.id, status: 'PAID', amountCents: 10000 }) // manual
    orderById(order.id as string).paymentStatus = 'PAID'

    const r = await applyGatewayPaymentUpdate(mp({ orderId: order.id, rawStatus: 'approved', mappedStatus: 'PAID' }))

    expect(r.outcome).toBe('conflict')
    const mpPay = h.fake._state.payments.find((p) => p.providerPaymentId === 'mp_1')!
    expect(mpPay.status).toBe('PENDING')
    expect(orderById(order.id as string).paymentStatus).toBe('PAID')
  })

  it('pedido inexistente → PaymentServiceError', async () => {
    await expect(
      applyGatewayPaymentUpdate(mp({ orderId: 'nao_existe' })),
    ).rejects.toBeInstanceOf(PaymentServiceError)
  })
})

// ---------------------------------------------------------------------------
function order10k() {
  return h.fake.seedOrder({ totalCents: 10000, paymentStatus: 'PENDING', currency: 'BRL' })
}
