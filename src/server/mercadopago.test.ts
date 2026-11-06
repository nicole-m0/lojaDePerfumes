import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakePrisma, type FakePrisma, type Row } from '@/test/fake-prisma'
import type { MercadoPagoPayment } from '@/lib/mercadopago'

// ---------------------------------------------------------------------------
// Testes da orquestração Mercado Pago (webhook + reconsulta). Não batem na API
// real: `fetchPayment` / `searchPayments` são injetados. O Prisma é o mesmo fake
// usado em payments.test.ts.
// ---------------------------------------------------------------------------

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

import {
  processMercadoPagoNotification,
  reconcileOrderWithMercadoPago,
} from '@/server/mercadopago'

function payment(over: Partial<MercadoPagoPayment> = {}): MercadoPagoPayment {
  return {
    id: 'mp_1',
    status: 'approved',
    externalReference: 'ord_1',
    transactionAmount: 100,
    currencyId: 'BRL',
    paymentTypeId: 'credit_card',
    paymentMethodId: 'visa',
    ...over,
  }
}

function seedOrder(over: Row = {}) {
  return h.fake.seedOrder({ id: 'ord_1', totalCents: 10000, currency: 'BRL', paymentStatus: 'PENDING', ...over })
}

function paymentsOf(orderId: string) {
  return h.fake._state.payments.filter((p) => p.orderId === orderId)
}
function notesOf(orderId: string) {
  return h.fake._state.orderEvents.filter((e) => e.orderId === orderId && e.type === 'NOTE')
}

beforeEach(() => {
  h.fake = makeFakePrisma()
})

// ---------------------------------------------------------------------------
describe('processMercadoPagoNotification', () => {
  it('ignora notificação que não é de pagamento — sem consultar a API', async () => {
    const fetchPayment = vi.fn()
    const r = await processMercadoPagoNotification({ type: 'merchant_order', dataId: '123' }, { fetchPayment })
    expect(r.outcome).toBe('ignored')
    expect(fetchPayment).not.toHaveBeenCalled()
  })

  it('ignora quando falta data.id', async () => {
    const fetchPayment = vi.fn()
    const r = await processMercadoPagoNotification({ type: 'payment', dataId: null }, { fetchPayment })
    expect(r.outcome).toBe('ignored')
    expect(fetchPayment).not.toHaveBeenCalled()
  })

  it('webhook válido CONSULTA o pagamento na API e aplica approved → PAID', async () => {
    seedOrder()
    const fetchPayment = vi.fn().mockResolvedValue(payment({ status: 'approved' }))

    const r = await processMercadoPagoNotification({ type: 'payment', dataId: 'mp_1' }, { fetchPayment })

    expect(fetchPayment).toHaveBeenCalledWith('mp_1')
    expect(r.outcome).toBe('applied')
    expect(r.paymentStatus).toBe('PAID')
    expect(paymentsOf('ord_1')[0]).toMatchObject({
      status: 'PAID',
      provider: 'mercadopago',
      providerPaymentId: 'mp_1',
    })
    expect(h.fake._state.orders[0].paymentStatus).toBe('PAID')
  })

  it('pending / in_process → PENDING', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'in_process' })) },
    )
    expect(r.paymentStatus).toBe('PENDING')
    expect(paymentsOf('ord_1')[0].status).toBe('PENDING')
  })

  it('rejected / cancelled → FAILED', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'cancelled' })) },
    )
    expect(r.outcome).toBe('applied')
    expect(paymentsOf('ord_1')[0].status).toBe('FAILED')
    expect(h.fake._state.orders[0].paymentStatus).toBe('PENDING')
  })

  it('refunded → não aplica REFUNDED sozinho: exige OWNER', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'refunded' })) },
    )
    expect(r.outcome).toBe('owner_action_required')
    expect(paymentsOf('ord_1')[0].status).toBe('PAID')
    expect(notesOf('ord_1').some((n) => /OWNER/.test(String(n.note)))).toBe(true)
  })

  it('charged_back → não aplica CHARGEBACK sozinho: exige OWNER', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'charged_back' })) },
    )
    expect(r.outcome).toBe('owner_action_required')
    expect(paymentsOf('ord_1')[0].status).toBe('PAID')
  })

  it('status desconhecido não altera o pagamento', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'in_mediation' })) },
    )
    expect(r.outcome).toBe('noop')
    expect(paymentsOf('ord_1')[0].status).toBe('PENDING')
    expect(h.fake._state.orders[0].paymentStatus).toBe('PENDING')
  })

  it('notificação repetida é idempotente — não duplica Payment nem efeito', async () => {
    seedOrder()
    const fetchPayment = vi.fn().mockResolvedValue(payment({ status: 'approved' }))

    const r1 = await processMercadoPagoNotification({ type: 'payment', dataId: 'mp_1' }, { fetchPayment })
    const eventsAfter1 = h.fake._state.orderEvents.length
    const r2 = await processMercadoPagoNotification({ type: 'payment', dataId: 'mp_1' }, { fetchPayment })

    expect(r1.outcome).toBe('applied')
    expect(r2.outcome).toBe('noop')
    expect(paymentsOf('ord_1')).toHaveLength(1)
    expect(h.fake._state.orderEvents.length).toBe(eventsAfter1)
    expect(h.fake._state.orders[0].paymentStatus).toBe('PAID')
  })

  it('valor divergente é REJEITADO — nada é aplicado, nota de auditoria é gravada', async () => {
    seedOrder({ totalCents: 10000 })
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'approved', transactionAmount: 99.5 })) },
    )
    expect(r.outcome).toBe('amount_mismatch')
    expect(paymentsOf('ord_1')).toHaveLength(0)
    expect(notesOf('ord_1').some((n) => /divergência/i.test(String(n.note)))).toBe(true)
    expect(h.fake._state.orders[0].paymentStatus).toBe('PENDING')
  })

  it('moeda divergente é rejeitada', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ status: 'approved', currencyId: 'ARS' })) },
    )
    expect(r.outcome).toBe('amount_mismatch')
    expect(paymentsOf('ord_1')).toHaveLength(0)
  })

  it('pagamento de outro pedido (external_reference sem correspondência) → order_not_found', async () => {
    seedOrder({ id: 'ord_1' })
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ externalReference: 'ord_OUTRO' })) },
    )
    expect(r.outcome).toBe('order_not_found')
    expect(paymentsOf('ord_1')).toHaveLength(0)
  })

  it('pagamento sem external_reference → order_not_found', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_1' },
      { fetchPayment: vi.fn().mockResolvedValue(payment({ externalReference: null })) },
    )
    expect(r.outcome).toBe('order_not_found')
  })

  it('pagamento inexistente na API → payment_not_found', async () => {
    seedOrder()
    const r = await processMercadoPagoNotification(
      { type: 'payment', dataId: 'mp_x' },
      { fetchPayment: vi.fn().mockResolvedValue(null) },
    )
    expect(r.outcome).toBe('payment_not_found')
  })
})

// ---------------------------------------------------------------------------
describe('reconcileOrderWithMercadoPago', () => {
  it('sem pagamentos no Mercado Pago → found = 0', async () => {
    seedOrder()
    const r = await reconcileOrderWithMercadoPago('ord_1', { searchPayments: vi.fn().mockResolvedValue([]) })
    expect(r.found).toBe(0)
    expect(r.results).toHaveLength(0)
  })

  it('aplica cada pagamento retornado, do mais antigo para o mais novo, e é idempotente', async () => {
    seedOrder()
    // A busca do MP vem do mais novo para o mais antigo.
    const search = vi
      .fn()
      .mockResolvedValue([payment({ id: 'mp_2', status: 'approved' }), payment({ id: 'mp_1', status: 'pending' })])

    const r1 = await reconcileOrderWithMercadoPago('ord_1', { searchPayments: search })
    expect(r1.found).toBe(2)
    expect(paymentsOf('ord_1')).toHaveLength(2)
    expect(h.fake._state.orders[0].paymentStatus).toBe('PAID') // mp_2 approved cobre o total

    const eventsAfter1 = h.fake._state.orderEvents.length
    const r2 = await reconcileOrderWithMercadoPago('ord_1', { searchPayments: search })
    expect(r2.results.every((x) => x.outcome === 'noop')).toBe(true)
    expect(paymentsOf('ord_1')).toHaveLength(2)
    expect(h.fake._state.orderEvents.length).toBe(eventsAfter1)
  })

  it('reconsulta respeita o gate OWNER: refunded fica sinalizado, não aplicado', async () => {
    seedOrder()
    const search = vi.fn().mockResolvedValue([payment({ id: 'mp_1', status: 'refunded' })])
    const r = await reconcileOrderWithMercadoPago('ord_1', { searchPayments: search })
    expect(r.results[0].outcome).toBe('owner_action_required')
    expect(paymentsOf('ord_1')[0].status).toBe('PAID')
  })
})
