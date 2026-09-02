import { describe, expect, it } from 'vitest'
import {
  canTransition,
  isTerminalPaymentStatus,
  mapMercadoPagoStatus,
  nextStatuses,
  summarizePayments,
} from './payment-status'

describe('máquina de estados do pagamento', () => {
  it('permite as transições aprovadas', () => {
    expect(canTransition('PENDING', 'PAID')).toBe(true)
    expect(canTransition('PENDING', 'FAILED')).toBe(true)
    expect(canTransition('PENDING', 'CANCELED')).toBe(true)
    expect(canTransition('FAILED', 'PENDING')).toBe(true)
    expect(canTransition('FAILED', 'CANCELED')).toBe(true)
    expect(canTransition('PAID', 'REFUNDED')).toBe(true)
    expect(canTransition('PAID', 'CHARGEBACK')).toBe(true)
  })

  it('não permite transições arbitrárias', () => {
    expect(canTransition('PAID', 'PAID')).toBe(false)
    expect(canTransition('PENDING', 'REFUNDED')).toBe(false)
    expect(canTransition('PENDING', 'CHARGEBACK')).toBe(false)
    expect(canTransition('PAID', 'PENDING')).toBe(false)
    expect(canTransition('PAID', 'FAILED')).toBe(false)
    expect(canTransition('CANCELED', 'PENDING')).toBe(false)
  })

  it('PARTIALLY_PAID nunca é destino nem origem de transição manual', () => {
    expect(nextStatuses('PARTIALLY_PAID')).toEqual([])
    for (const from of ['PENDING', 'FAILED', 'PAID'] as const) {
      expect(canTransition(from, 'PARTIALLY_PAID')).toBe(false)
    }
  })

  it('REFUNDED, CHARGEBACK e CANCELED são terminais', () => {
    expect(isTerminalPaymentStatus('REFUNDED')).toBe(true)
    expect(isTerminalPaymentStatus('CHARGEBACK')).toBe(true)
    expect(isTerminalPaymentStatus('CANCELED')).toBe(true)
    expect(isTerminalPaymentStatus('PENDING')).toBe(false)
    expect(isTerminalPaymentStatus('FAILED')).toBe(false)
    expect(isTerminalPaymentStatus('PAID')).toBe(false)
  })
})

describe('summarizePayments', () => {
  it('nenhum pagamento pago → PENDING, valor restante = total', () => {
    const summary = summarizePayments([{ status: 'PENDING', amountCents: 1000 }], 1000)
    expect(summary).toEqual({
      paidCents: 0,
      pendingCents: 1000,
      refundedCents: 0,
      chargebackCents: 0,
      remainingCents: 1000,
      availableToRegisterCents: 0,
      status: 'PENDING',
    })
  })

  it('pendingCents soma só os PENDING; availableToRegisterCents = total - pago - pendente', () => {
    const summary = summarizePayments(
      [
        { status: 'PAID', amountCents: 300 },
        { status: 'PENDING', amountCents: 200 },
        { status: 'PENDING', amountCents: 100 },
        { status: 'FAILED', amountCents: 900 },
      ],
      1000,
    )
    expect(summary.paidCents).toBe(300)
    expect(summary.pendingCents).toBe(300)
    expect(summary.remainingCents).toBe(700) // o pedido ainda deve 700 (total - pago)
    expect(summary.availableToRegisterCents).toBe(400) // 1000 - 300 pago - 300 pendente
  })

  it('availableToRegisterCents nunca fica negativo quando pendências passam do total', () => {
    const summary = summarizePayments(
      [
        { status: 'PAID', amountCents: 600 },
        { status: 'PENDING', amountCents: 800 },
      ],
      1000,
    )
    expect(summary.availableToRegisterCents).toBe(0)
    expect(summary.remainingCents).toBe(400)
  })

  it('pagamento falhado/cancelado sem valor pago → PENDING', () => {
    const summary = summarizePayments(
      [
        { status: 'FAILED', amountCents: 1000 },
        { status: 'CANCELED', amountCents: 1000 },
      ],
      1000,
    )
    expect(summary.status).toBe('PENDING')
    expect(summary.paidCents).toBe(0)
    expect(summary.remainingCents).toBe(1000)
  })

  it('pagamento parcial → PARTIALLY_PAID, com saldo restante correto', () => {
    const summary = summarizePayments([{ status: 'PAID', amountCents: 400 }], 1000)
    expect(summary.status).toBe('PARTIALLY_PAID')
    expect(summary.paidCents).toBe(400)
    expect(summary.remainingCents).toBe(600)
  })

  it('pagamento complementar soma com o parcial e fecha em PAID', () => {
    const summary = summarizePayments(
      [
        { status: 'PAID', amountCents: 400 },
        { status: 'PAID', amountCents: 600 },
      ],
      1000,
    )
    expect(summary.status).toBe('PAID')
    expect(summary.paidCents).toBe(1000)
    expect(summary.remainingCents).toBe(0)
  })

  it('múltiplos Payments não-pagos não contam para o total pago', () => {
    const summary = summarizePayments(
      [
        { status: 'PAID', amountCents: 500 },
        { status: 'FAILED', amountCents: 500 },
        { status: 'PENDING', amountCents: 500 },
      ],
      1000,
    )
    expect(summary.status).toBe('PARTIALLY_PAID')
    expect(summary.paidCents).toBe(500)
    expect(summary.remainingCents).toBe(500)
  })

  it('estorno total (sem saldo pago) → REFUNDED', () => {
    const summary = summarizePayments([{ status: 'REFUNDED', amountCents: 1000 }], 1000)
    expect(summary.status).toBe('REFUNDED')
    expect(summary.paidCents).toBe(0)
    expect(summary.remainingCents).toBe(1000)
  })

  it('chargeback total (sem saldo pago) → CHARGEBACK', () => {
    const summary = summarizePayments([{ status: 'CHARGEBACK', amountCents: 1000 }], 1000)
    expect(summary.status).toBe('CHARGEBACK')
    expect(summary.remainingCents).toBe(1000)
  })

  it('não usa apenas a quantidade de Payments — dois PENDING de valor baixo continuam PENDING', () => {
    const summary = summarizePayments(
      [
        { status: 'PENDING', amountCents: 100 },
        { status: 'PENDING', amountCents: 100 },
        { status: 'PENDING', amountCents: 100 },
      ],
      1000,
    )
    expect(summary.status).toBe('PENDING')
    expect(summary.paidCents).toBe(0)
  })

  it('lista vazia de Payments → PENDING, saldo restante = total', () => {
    const summary = summarizePayments([], 1000)
    expect(summary.status).toBe('PENDING')
    expect(summary.remainingCents).toBe(1000)
  })
})

describe('mapMercadoPagoStatus', () => {
  it('approved → PAID', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('PAID')
  })

  it('pending → PENDING', () => {
    expect(mapMercadoPagoStatus('pending')).toBe('PENDING')
  })

  it('in_process → PENDING', () => {
    expect(mapMercadoPagoStatus('in_process')).toBe('PENDING')
  })

  it('rejected → FAILED', () => {
    expect(mapMercadoPagoStatus('rejected')).toBe('FAILED')
  })

  it('cancelled → FAILED', () => {
    expect(mapMercadoPagoStatus('cancelled')).toBe('FAILED')
  })

  it('refunded → REFUNDED', () => {
    expect(mapMercadoPagoStatus('refunded')).toBe('REFUNDED')
  })

  it('charged_back → CHARGEBACK', () => {
    expect(mapMercadoPagoStatus('charged_back')).toBe('CHARGEBACK')
  })

  it('status desconhecido → null (não causa mudança interna)', () => {
    expect(mapMercadoPagoStatus('in_mediation')).toBeNull()
    expect(mapMercadoPagoStatus('authorized')).toBeNull()
    expect(mapMercadoPagoStatus('')).toBeNull()
    expect(mapMercadoPagoStatus('qualquer_coisa_futura')).toBeNull()
  })

  it('todo status mapeado devolve um PaymentStatusValue que o domínio conhece', () => {
    const known = new Set(['PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'CHARGEBACK', 'FAILED', 'CANCELED'])
    for (const mp of ['approved', 'pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
      const mapped = mapMercadoPagoStatus(mp)
      expect(mapped).not.toBeNull()
      expect(known.has(mapped as string)).toBe(true)
    }
  })
})
