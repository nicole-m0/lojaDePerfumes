// Máquina de estados do pagamento — função pura e testável.
// Validada SEMPRE no servidor; o cliente nunca é fonte da verdade.
//
// Duas coisas diferentes usam PaymentStatus:
// 1) Payment.status — transição MANUAL feita pelo admin (máquina de estados abaixo).
// 2) Order.paymentStatus — NUNCA editado manualmente; é sempre recalculado a partir da
//    soma dos Payments do pedido (ver `summarizePayments`). PARTIALLY_PAID só existe como
//    resultado desse cálculo — não é destino válido de transição manual de um Payment
//    individual (um pagamento isolado está pago ou não está; "parcial" é propriedade do
//    pedido, que pode ter vários Payments).

export type PaymentStatusValue =
  | 'PENDING'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'REFUNDED'
  | 'CHARGEBACK'
  | 'FAILED'
  | 'CANCELED'

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusValue, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  PARTIALLY_PAID: 'Parcialmente pago',
  REFUNDED: 'Estornado',
  CHARGEBACK: 'Chargeback',
  FAILED: 'Falhou',
  CANCELED: 'Cancelado',
}

// Transições manuais válidas de um Payment individual.
// PARTIALLY_PAID nunca aparece aqui: é status calculado do Order, nunca de um Payment.
// REFUNDED, CHARGEBACK e CANCELED são terminais.
const TRANSITIONS: Record<PaymentStatusValue, PaymentStatusValue[]> = {
  PENDING: ['PAID', 'FAILED', 'CANCELED'],
  FAILED: ['PENDING', 'CANCELED'],
  PAID: ['REFUNDED', 'CHARGEBACK'],
  PARTIALLY_PAID: [],
  REFUNDED: [],
  CHARGEBACK: [],
  CANCELED: [],
}

export function nextStatuses(from: PaymentStatusValue): PaymentStatusValue[] {
  return TRANSITIONS[from] ?? []
}

export function canTransition(from: PaymentStatusValue, to: PaymentStatusValue): boolean {
  return nextStatuses(from).includes(to)
}

export function isTerminalPaymentStatus(status: PaymentStatusValue): boolean {
  return nextStatuses(status).length === 0
}

// ---------------------------------------------------------------------------
// Cálculo do valor pago / restante e sincronização de Order.paymentStatus.
// Puro: recebe os Payments já lidos do banco, nunca lê Prisma diretamente.
// ---------------------------------------------------------------------------

export interface PaymentForSync {
  status: PaymentStatusValue
  amountCents: number
}

export interface PaymentSummary {
  /** Soma dos Payments atualmente PAID — "quanto já foi pago" (nunca conta REFUNDED/CHARGEBACK). */
  paidCents: number
  refundedCents: number
  chargebackCents: number
  /** orderTotalCents - paidCents, nunca negativo. */
  remainingCents: number
  /** Order.paymentStatus sincronizado a partir dos Payments. */
  status: PaymentStatusValue
}

/**
 * Deriva o status de pagamento do PEDIDO a partir da lista de Payments.
 * Nunca usa apenas a quantidade de Payments — sempre os valores (amountCents) dos que
 * estão efetivamente PAID/REFUNDED/CHARGEBACK. Overpayment é impedido em outra camada
 * (src/server/payments.ts); aqui `remainingCents` só protege contra ficar negativo.
 */
export function summarizePayments(
  payments: PaymentForSync[],
  orderTotalCents: number,
): PaymentSummary {
  let paidCents = 0
  let refundedCents = 0
  let chargebackCents = 0

  for (const p of payments) {
    if (p.status === 'PAID') paidCents += p.amountCents
    else if (p.status === 'REFUNDED') refundedCents += p.amountCents
    else if (p.status === 'CHARGEBACK') chargebackCents += p.amountCents
  }

  // Dinheiro que já passou por PAID em algum momento, mesmo que depois tenha sido
  // estornado/chargeback — usado para distinguir "nunca foi pago" de "foi pago e revertido".
  const everCollectedCents = paidCents + refundedCents + chargebackCents
  const remainingCents = Math.max(orderTotalCents - paidCents, 0)

  let status: PaymentStatusValue
  if (chargebackCents > 0 && paidCents === 0 && everCollectedCents >= orderTotalCents) {
    status = 'CHARGEBACK'
  } else if (
    refundedCents > 0 &&
    paidCents === 0 &&
    chargebackCents === 0 &&
    everCollectedCents >= orderTotalCents
  ) {
    status = 'REFUNDED'
  } else if (orderTotalCents > 0 && paidCents >= orderTotalCents) {
    status = 'PAID'
  } else if (paidCents > 0) {
    status = 'PARTIALLY_PAID'
  } else {
    status = 'PENDING'
  }

  return { paidCents, refundedCents, chargebackCents, remainingCents, status }
}
