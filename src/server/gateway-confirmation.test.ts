import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakePrisma, type FakePrisma, type Row } from '@/test/fake-prisma'
import type { MercadoPagoPayment } from '@/lib/mercadopago'

// ---------------------------------------------------------------------------
// Etapa D2 — confirmação automática do pedido e baixa de estoque quando o Mercado
// Pago aprova um pagamento. Exercita o fluxo real: orquestração do webhook e da
// reconsulta (src/server/mercadopago.ts) → serviço central de pagamentos → regra de
// confirmação (order-transitions.ts) → estoque (stock.ts). Sem banco: Prisma falso
// (src/test/fake-prisma.ts) com trava do pedido, rollback e falha simulada. A API
// do Mercado Pago e o aviso de WhatsApp são injetados.
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
  type NotifyOrderConfirmed,
} from '@/server/mercadopago'
import { createManualPayment, transitionPaymentStatus } from '@/server/payments'

const ORDER_ID = 'ord_1'
const staff = { id: 'user_1', email: 'admin@test', role: 'ADMIN' } as never

function mpPayment(over: Partial<MercadoPagoPayment> = {}): MercadoPagoPayment {
  return {
    id: 'mp_1',
    status: 'approved',
    externalReference: ORDER_ID,
    transactionAmount: 100,
    currencyId: 'BRL',
    paymentTypeId: 'credit_card',
    paymentMethodId: 'visa',
    ...over,
  }
}

/** Pedido #7 de R$ 100,00: 2× Rosalume + 1× Ambarê (em duas linhas) + 1× Ervaria. */
function seed(over: Row = {}, stock: Record<string, number> = { p_rosa: 5, p_ambar: 5, p_erva: 5 }) {
  h.fake.seedOrder({
    id: ORDER_ID,
    number: 7,
    customerPhone: '+5511999990000',
    totalCents: 10000,
    currency: 'BRL',
    ...over,
  })
  h.fake.seedItem({ orderId: ORDER_ID, productId: 'p_rosa', productName: 'Rosalume', quantity: 2 })
  h.fake.seedItem({ orderId: ORDER_ID, productId: 'p_ambar', productName: 'Ambarê', quantity: 1 })
  h.fake.seedItem({ orderId: ORDER_ID, productId: 'p_ambar', productName: 'Ambarê', quantity: 1 })
  h.fake.seedItem({ orderId: ORDER_ID, productId: 'p_erva', productName: 'Ervaria', quantity: 1 })
  for (const [id, qty] of Object.entries(stock)) h.fake.seedProduct(id, qty)
}

const st = () => h.fake._state
const order = () => st().orders.find((o) => o.id === ORDER_ID)!
const stock = (id: string) => st().products.find((p) => p.id === id)!.stockOnHand
const saleMovements = () =>
  st().stockMovements.filter((m) => m.orderId === ORDER_ID && m.type === 'OUTBOUND' && m.reason === 'SALE')
const confirmEvents = () =>
  st().orderEvents.filter((e) => e.type === 'ORDER_STATUS_CHANGED' && e.toStatus === 'CONFIRMED')
const ownerNotes = () =>
  st().orderEvents.filter((e) => e.type === 'NOTE' && String(e.note).startsWith('ATENÇÃO (OWNER)'))

function expectUntouchedStock() {
  expect(stock('p_rosa')).toBe(5)
  expect(stock('p_ambar')).toBe(5)
  expect(stock('p_erva')).toBe(5)
  expect(saleMovements()).toHaveLength(0)
}

let notify: ReturnType<typeof vi.fn> & NotifyOrderConfirmed

/** Notificação do webhook para um pagamento cujo estado atual na API é `mp`. */
function webhook(mp: MercadoPagoPayment) {
  return processMercadoPagoNotification(
    { type: 'payment', dataId: mp.id },
    { fetchPayment: async () => mp, notifyOrderConfirmed: notify },
  )
}
function reconcile(...list: MercadoPagoPayment[]) {
  return reconcileOrderWithMercadoPago(ORDER_ID, {
    searchPayments: async () => list,
    notifyOrderConfirmed: notify,
  })
}

beforeEach(() => {
  h.fake = makeFakePrisma()
  notify = vi.fn(async () => {}) as typeof notify
})

describe('pagamento aprovado', () => {
  it('confirma o pedido, baixa o estoque por produto e registra tudo na mesma operação', async () => {
    seed()

    const result = await webhook(mpPayment())

    expect(result).toMatchObject({ outcome: 'applied', paymentStatus: 'PAID', orderConfirmation: 'confirmed' })
    expect(order().status).toBe('CONFIRMED')
    expect(order().paymentStatus).toBe('PAID')
    expect(stock('p_rosa')).toBe(3)
    expect(stock('p_ambar')).toBe(3) // duas linhas do mesmo produto somadas
    expect(stock('p_erva')).toBe(4)

    const sales = saleMovements()
    expect(sales.map((m) => [m.productId, m.quantity]).sort()).toEqual([
      ['p_ambar', 2],
      ['p_erva', 1],
      ['p_rosa', 2],
    ])
    expect(sales.every((m) => m.userId === null)).toBe(true) // ação do sistema

    expect(confirmEvents()).toHaveLength(1)
    expect(confirmEvents()[0]).toMatchObject({ fromStatus: 'PENDING', userId: null })
    expect(String(confirmEvents()[0].note)).toContain('pagamento mp_1')
    expect(ownerNotes()).toHaveLength(0)
  })

  it('o aviso de confirmação roda depois do commit, com número e telefone do pedido', async () => {
    seed()
    notify.mockImplementation(async () => {
      // Quando o aviso roda, a transação já terminou: estado gravado e trava livre.
      expect(order().status).toBe('CONFIRMED')
      expect(stock('p_rosa')).toBe(3)
      await h.fake.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${ORDER_ID} FOR UPDATE`
      })
    })

    await webhook(mpPayment())

    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0][0]).toEqual({
      orderId: ORDER_ID,
      confirmation: { outcome: 'confirmed', number: 7, customerPhone: '+5511999990000' },
    })
  })

  it('falha no aviso não desfaz a confirmação nem muda o resultado', async () => {
    seed()
    notify.mockRejectedValue(new Error('WhatsApp fora do ar'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await webhook(mpPayment())

    expect(result.orderConfirmation).toBe('confirmed')
    expect(order().status).toBe('CONFIRMED')
    expect(stock('p_rosa')).toBe(3)
    expect(spy).toHaveBeenCalled()
  })

  it('a resposta não expõe dados do cliente (vai para o Mercado Pago)', async () => {
    seed()
    const result = await webhook(mpPayment())
    expect(JSON.stringify(result)).not.toContain('+5511999990000')
  })

  it('pendente → aprovado: confirma só na aprovação', async () => {
    seed()
    await webhook(mpPayment({ status: 'pending' }))
    expect(order().status).toBe('PENDING')
    expectUntouchedStock()

    const result = await webhook(mpPayment({ status: 'approved' }))
    expect(result.orderConfirmation).toBe('confirmed')
    expect(order().status).toBe('CONFIRMED')
    expect(stock('p_rosa')).toBe(3)
  })
})

describe('idempotência', () => {
  it('notificação repetida não baixa o estoque de novo nem repete o aviso', async () => {
    seed()
    await webhook(mpPayment())
    const again = await webhook(mpPayment())
    const third = await webhook(mpPayment())

    expect(again.outcome).toBe('noop')
    expect(third.outcome).toBe('noop')
    expect(again.orderConfirmation).toBeUndefined()
    expect(stock('p_rosa')).toBe(3)
    expect(saleMovements()).toHaveLength(3) // 1 por produto, uma vez só
    expect(confirmEvents()).toHaveLength(1)
    expect(st().payments).toHaveLength(1)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('reconsulta depois do webhook não baixa de novo', async () => {
    seed()
    await webhook(mpPayment())
    const { results } = await reconcile(mpPayment())

    expect(results[0].outcome).toBe('noop')
    expect(stock('p_rosa')).toBe(3)
    expect(confirmEvents()).toHaveLength(1)
  })

  it('pedido já confirmado manualmente antes do pagamento não é baixado de novo', async () => {
    seed({ status: 'CONFIRMED' })
    // Baixa feita na confirmação manual (histórico do pedido).
    for (const [productId, quantity] of [['p_rosa', 2], ['p_ambar', 2], ['p_erva', 1]] as const) {
      st().stockMovements.push({ id: `m_${productId}`, productId, type: 'OUTBOUND', reason: 'SALE', quantity, orderId: ORDER_ID })
      st().products.find((p) => p.id === productId)!.stockOnHand = 5 - quantity
    }

    const result = await webhook(mpPayment())

    expect(result.orderConfirmation).toBe('already_confirmed')
    expect(stock('p_rosa')).toBe(3)
    expect(saleMovements()).toHaveLength(3)
    expect(confirmEvents()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('concorrência', () => {
  it('webhook e reconsulta simultâneos baixam o estoque uma única vez', async () => {
    seed()

    const [hook, rec] = await Promise.all([webhook(mpPayment()), reconcile(mpPayment())])

    const outcomes = [hook.outcome, rec.results[0].outcome].sort()
    expect(outcomes).toEqual(['applied', 'noop'])
    expect(order().status).toBe('CONFIRMED')
    expect(stock('p_rosa')).toBe(3)
    expect(stock('p_ambar')).toBe(3)
    expect(stock('p_erva')).toBe(4)
    expect(saleMovements()).toHaveLength(3)
    expect(confirmEvents()).toHaveLength(1)
    expect(st().payments).toHaveLength(1)
    expect(notify).toHaveBeenCalledOnce()
  })

  it('várias notificações simultâneas do mesmo pagamento baixam uma única vez', async () => {
    seed()

    const results = await Promise.all([1, 2, 3, 4].map(() => webhook(mpPayment())))

    expect(results.filter((r) => r.outcome === 'applied')).toHaveLength(1)
    expect(results.filter((r) => r.orderConfirmation === 'confirmed')).toHaveLength(1)
    expect(stock('p_rosa')).toBe(3)
    expect(saleMovements()).toHaveLength(3)
    expect(confirmEvents()).toHaveLength(1)
  })
})

describe('pagamentos que NÃO confirmam', () => {
  it.each([
    ['pending', 'PENDING'],
    ['in_process', 'PENDING'],
    ['rejected', 'FAILED'],
    ['cancelled', 'FAILED'],
  ])('status "%s" → Payment %s, pedido segue PENDING, sem baixa', async (status, paymentStatus) => {
    seed()

    const result = await webhook(mpPayment({ status }))

    expect(result.orderConfirmation).toBeUndefined()
    expect(st().payments[0].status).toBe(paymentStatus)
    expect(order().status).toBe('PENDING')
    expect(order().paymentStatus).toBe('PENDING')
    expectUntouchedStock()
    expect(confirmEvents()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('aprovado e depois estornado (refunded) na primeira notificação não confirma', async () => {
    seed()
    const result = await webhook(mpPayment({ status: 'refunded' }))

    expect(result.outcome).toBe('owner_action_required')
    expect(result.orderConfirmation).toBeUndefined()
    expect(order().status).toBe('PENDING')
    expectUntouchedStock()
  })

  it('valor divergente não grava pagamento nem confirma', async () => {
    seed()
    const result = await webhook(mpPayment({ transactionAmount: 1 }))

    expect(result.outcome).toBe('amount_mismatch')
    expect(order().status).toBe('PENDING')
    expectUntouchedStock()
  })
})

describe('pagamento manual no painel', () => {
  it('marcar como PAID manualmente NÃO confirma o pedido nem baixa estoque', async () => {
    seed()
    const payment = await createManualPayment({
      orderId: ORDER_ID,
      method: 'PIX',
      amountCents: 10000,
      notes: null,
      staff,
    })

    await transitionPaymentStatus({ orderId: ORDER_ID, paymentId: payment.id as string, toStatus: 'PAID', note: null, staff })

    expect(order().paymentStatus).toBe('PAID')
    expect(order().status).toBe('PENDING')
    expectUntouchedStock()
    expect(confirmEvents()).toHaveLength(0)
  })

  it('pedido já pago manualmente: aprovação posterior no Mercado Pago também não confirma', async () => {
    seed()
    const payment = await createManualPayment({ orderId: ORDER_ID, method: 'PIX', amountCents: 10000, notes: null, staff })
    await transitionPaymentStatus({ orderId: ORDER_ID, paymentId: payment.id as string, toStatus: 'PAID', note: null, staff })

    const result = await webhook(mpPayment())

    expect(result.outcome).toBe('conflict')
    expect(result.orderConfirmation).toBeUndefined()
    expect(order().status).toBe('PENDING')
    expectUntouchedStock()
  })
})

describe('pedidos que não podem ser confirmados', () => {
  it('pedido CANCELADO: pagamento é gravado, pedido não é confirmado, OWNER é avisado', async () => {
    seed({ status: 'CANCELED' })

    const result = await webhook(mpPayment())

    expect(result).toMatchObject({ outcome: 'applied', paymentStatus: 'PAID', orderConfirmation: 'order_canceled' })
    expect(order().status).toBe('CANCELED')
    expectUntouchedStock()
    expect(ownerNotes()).toHaveLength(1)
    expect(String(ownerNotes()[0].note)).toMatch(/CANCELADO.*estorno/s)
    expect(notify).not.toHaveBeenCalled()
  })

  it('pedido em RASCUNHO não é confirmado automaticamente', async () => {
    seed({ status: 'DRAFT' })

    const result = await webhook(mpPayment())

    expect(result.orderConfirmation).toBe('not_pending')
    expect(order().status).toBe('DRAFT')
    expectUntouchedStock()
    expect(ownerNotes()).toHaveLength(1)
  })
})

describe('estoque insuficiente', () => {
  it('não confirma, não baixa NADA (nem os itens com saldo) e avisa o OWNER', async () => {
    // Rosalume tem saldo; Ambarê precisa de 2 e só tem 1.
    seed({}, { p_rosa: 5, p_ambar: 1, p_erva: 5 })

    const result = await webhook(mpPayment())

    expect(result).toMatchObject({ outcome: 'applied', paymentStatus: 'PAID', orderConfirmation: 'insufficient_stock' })
    expect(order().status).toBe('PENDING')
    expect(order().paymentStatus).toBe('PAID') // o dinheiro entrou: pagamento fica registrado
    expect(stock('p_rosa')).toBe(5)
    expect(stock('p_ambar')).toBe(1)
    expect(stock('p_erva')).toBe(5)
    expect(st().products.every((p) => (p.stockOnHand as number) >= 0)).toBe(true)
    expect(saleMovements()).toHaveLength(0)
    expect(confirmEvents()).toHaveLength(0)

    expect(ownerNotes()).toHaveLength(1)
    const note = String(ownerNotes()[0].note)
    expect(note).toContain('Ambarê (precisa 2, disponível 1)')
    expect(note).not.toContain('Rosalume')
    expect(note).toMatch(/NÃO foi confirmado/)
    expect(notify).not.toHaveBeenCalled()
  })

  it('produto removido do cadastro conta como sem estoque', async () => {
    seed({}, { p_rosa: 5, p_ambar: 5 }) // p_erva não existe mais

    const result = await webhook(mpPayment())

    expect(result.orderConfirmation).toBe('insufficient_stock')
    expect(String(ownerNotes()[0].note)).toContain('Ervaria (precisa 1, disponível 0)')
    expect(stock('p_rosa')).toBe(5)
  })

  it('notificação repetida depois da falta de estoque não duplica o aviso', async () => {
    seed({}, { p_rosa: 5, p_ambar: 1, p_erva: 5 })
    await webhook(mpPayment())
    await webhook(mpPayment())

    expect(ownerNotes()).toHaveLength(1)
  })
})

describe('falha no meio da transação', () => {
  it.each(['stockMovement.create', 'product.updateMany', 'order.updateMany'])(
    'erro em %s desfaz tudo: sem pagamento, sem confirmação, sem baixa parcial',
    async (op) => {
      seed()
      h.fake.failOnce(op)

      await expect(webhook(mpPayment())).rejects.toThrow('falha simulada')

      expect(st().payments).toHaveLength(0)
      expect(order().status).toBe('PENDING')
      expect(order().paymentStatus).toBe('PENDING')
      expectUntouchedStock()
      expect(st().orderEvents).toHaveLength(0)
      expect(notify).not.toHaveBeenCalled()

      // O Mercado Pago reenvia (o webhook respondeu erro): agora confirma uma vez.
      const retry = await webhook(mpPayment())
      expect(retry.orderConfirmation).toBe('confirmed')
      expect(stock('p_rosa')).toBe(3)
      expect(saleMovements()).toHaveLength(3)
    },
  )
})
