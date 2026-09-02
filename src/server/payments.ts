import 'server-only'
import type { Prisma, PaymentMethod } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canTransition, summarizePayments, type PaymentStatusValue } from '@/lib/payment-status'
import type { StaffUser } from '@/server/guard'

// Serviço central de pagamentos — toda mutação de Payment/Order.paymentStatus passa por
// aqui. Sem gateway: registro manual pelo admin. Dinheiro sempre em centavos (Int).
//
// Order.paymentStatus NUNCA é escrito fora daqui — é sempre recalculado a partir dos
// Payments do pedido (summarizePayments), nunca setado manualmente pela UI.

type Tx = Prisma.TransactionClient

/** Erro esperado de validação/negócio de pagamento — vira mensagem segura para a UI. */
export class PaymentServiceError extends Error {}

interface PaymentRow {
  id: string
  status: PaymentStatusValue
  amountCents: number
  paidAt: Date | null
}

/**
 * Lock pessimista da linha do Order (`SELECT … FOR UPDATE`) — serializa TODA mutação de
 * pagamento do mesmo pedido. Sob READ COMMITTED (padrão do PostgreSQL) uma segunda
 * transação concorrente bloqueia aqui até a primeira commitar e, ao destravar, relê o
 * estado já atualizado dos Payments. Sem isto, duas confirmações simultâneas poderiam
 * ler o mesmo saldo "antigo" e cada uma marcar PAID, ultrapassando Order.totalCents.
 *
 * Precisa ser a PRIMEIRA operação da transação, antes de qualquer leitura de Payment.
 */
async function lockOrder(tx: Tx, orderId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `
  if (rows.length === 0) throw new PaymentServiceError('Pedido não encontrado.')
}

async function loadOrderWithPayments(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      totalCents: true,
      payments: { select: { id: true, status: true, amountCents: true, paidAt: true } },
    },
  })
  if (!order) throw new PaymentServiceError('Pedido não encontrado.')
  return { ...order, payments: order.payments as PaymentRow[] }
}

/**
 * Recalcula Order.paymentStatus a partir do estado atual dos Payments e persiste.
 * Chamar sempre dentro da MESMA transação que criou/alterou um Payment — nunca deixar
 * Order.paymentStatus dessincronizado do estado real de Payment[].
 */
async function syncOrderPaymentStatus(
  tx: Tx,
  orderId: string,
  totalCents: number,
  payments: { status: PaymentStatusValue; amountCents: number }[],
) {
  const summary = summarizePayments(payments, totalCents)
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: summary.status } })
  return summary
}

// ---------------------------------------------------------------------------
// Registro manual de um novo pagamento
// ---------------------------------------------------------------------------

export interface CreatePaymentInput {
  orderId: string
  method: PaymentMethod
  amountCents: number
  notes: string | null
  staff: StaffUser
}

/**
 * Cria um novo Payment para o pedido. Sempre nasce PENDING — a confirmação de que o
 * dinheiro entrou é uma transição manual posterior (ver `transitionPaymentStatus`).
 * Nunca deixa o valor registrado ultrapassar o saldo restante do pedido (overpayment).
 */
export async function createManualPayment(input: CreatePaymentInput) {
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new PaymentServiceError('O valor do pagamento deve ser maior que zero.')
  }

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId)
    const order = await loadOrderWithPayments(tx, input.orderId)
    const summary = summarizePayments(order.payments, order.totalCents)

    // Barra overpayment contando o que já está PAGO **e** o que já está PENDENTE: a soma
    // de todos os Payments registrados nunca pode passar de Order.totalCents. Isso evita
    // acumular pendências "fantasma" que jamais poderiam ser confirmadas. Para registrar
    // um valor novo, um Payment pendente anterior precisa ser cancelado / marcado falho.
    if (input.amountCents > summary.availableToRegisterCents) {
      throw new PaymentServiceError(
        `Valor maior que o saldo ainda não coberto por pagamentos registrados ` +
          `(${summary.availableToRegisterCents} centavos). Cancele ou marque como falho um ` +
          `pagamento pendente antes de registrar outro.`,
      )
    }

    const payment = await tx.payment.create({
      data: {
        orderId: input.orderId,
        method: input.method,
        status: 'PENDING',
        amountCents: input.amountCents,
        notes: input.notes,
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        // OrderEventType do schema atual = ORDER_STATUS_CHANGED | PAYMENT_STATUS_CHANGED | NOTE.
        // "Pagamento criado" é um Payment entrando no estado PENDING: PAYMENT_STATUS_CHANGED
        // com fromStatus=null é a representação correta — não se cria um novo valor de enum
        // só para isto (seria migração de schema sem ganho real de auditoria).
        type: 'PAYMENT_STATUS_CHANGED',
        fromStatus: null,
        toStatus: 'PENDING',
        note: `Pagamento registrado manualmente (${input.method}, ${input.amountCents} centavos).`,
        userId: input.staff.id,
      },
    })

    // Um novo Payment PENDING não altera o total já pago, mas resincroniza por segurança
    // (nunca assume que o estado anterior de Order.paymentStatus já estava correto).
    await syncOrderPaymentStatus(tx, input.orderId, order.totalCents, [
      ...order.payments,
      { status: 'PENDING', amountCents: input.amountCents },
    ])

    return payment
  })
}

// ---------------------------------------------------------------------------
// Transição de status de um Payment existente
// ---------------------------------------------------------------------------

export interface TransitionPaymentStatusInput {
  orderId: string
  paymentId: string
  toStatus: PaymentStatusValue
  note: string | null
  staff: StaffUser
}

/**
 * Transiciona o status de um Payment específico, validando a máquina de estados
 * (src/lib/payment-status.ts) e revalidando overpayment antes de aceitar PAID.
 * Ao final, sempre resincroniza Order.paymentStatus na mesma transação.
 *
 * TODO(fase futura): quando houver papéis dedicados a pagamento, checar `staff.role`
 * aqui antes de permitir REFUNDED/CHARGEBACK (ex.: exigir OWNER/ADMIN). Por ora,
 * qualquer staff autenticado via requireStaff() pode operar (decisão da Parte 8).
 */
export async function transitionPaymentStatus(input: TransitionPaymentStatusInput) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId)
    const order = await loadOrderWithPayments(tx, input.orderId)
    const payment = order.payments.find((p) => p.id === input.paymentId)
    if (!payment) {
      throw new PaymentServiceError('Pagamento não encontrado para este pedido.')
    }

    const from = payment.status
    if (from === input.toStatus) {
      throw new PaymentServiceError('O pagamento já está nesse status.')
    }
    if (!canTransition(from, input.toStatus)) {
      throw new PaymentServiceError(
        `Transição de pagamento não permitida: ${from} → ${input.toStatus}.`,
      )
    }

    // Overpayment: revalida contra o estado atual de TODOS os pagamentos do pedido dentro
    // da transação. O `lockOrder` acima garante que esta releitura já enxerga qualquer
    // outro Payment marcado PAID por uma transação concorrente (ela commitou antes de nós
    // conseguirmos o lock) — sem o lock, duas confirmações simultâneas passariam as duas.
    if (input.toStatus === 'PAID') {
      const others = order.payments.filter((p) => p.id !== input.paymentId)
      const summaryWithoutThis = summarizePayments(others, order.totalCents)
      if (payment.amountCents > summaryWithoutThis.remainingCents) {
        throw new PaymentServiceError(
          'Não é possível marcar como pago: o valor excederia o total do pedido.',
        )
      }
    }

    const updated = await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: input.toStatus,
        paidAt: input.toStatus === 'PAID' ? (payment.paidAt ?? new Date()) : payment.paidAt,
      },
    })

    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        type: 'PAYMENT_STATUS_CHANGED',
        fromStatus: from,
        toStatus: input.toStatus,
        note: input.note,
        userId: input.staff.id,
      },
    })

    const nextPayments = order.payments.map((p) =>
      p.id === input.paymentId ? { ...p, status: input.toStatus } : p,
    )
    await syncOrderPaymentStatus(tx, input.orderId, order.totalCents, nextPayments)

    return updated
  })
}
