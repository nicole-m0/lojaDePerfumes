import 'server-only'
import type { Prisma, PaymentMethod } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canTransition, summarizePayments, type PaymentStatusValue } from '@/lib/payment-status'
import type { StaffUser } from '@/server/guard'

// Serviço central de pagamentos — toda mutação de Payment/Order.paymentStatus passa por
// aqui, tanto o registro manual pelo admin quanto o que vem do gateway (Mercado Pago).
// Dinheiro sempre em centavos (Int).
//
// Order.paymentStatus NUNCA é escrito fora daqui — é sempre recalculado a partir dos
// Payments do pedido (summarizePayments), nunca setado manualmente pela UI nem pelo webhook.
//
// Máquina de estados única: `canTransition` (src/lib/payment-status.ts). O gateway não
// tem uma segunda máquina — ele traduz o status cru (mapMercadoPagoStatus) e passa por
// esta mesma lógica.

type Tx = Prisma.TransactionClient

/** Erro esperado de validação/negócio de pagamento — vira mensagem segura para a UI. */
export class PaymentServiceError extends Error {}

interface PaymentRow {
  id: string
  status: PaymentStatusValue
  amountCents: number
  paidAt: Date | null
  provider: string | null
  providerPaymentId: string | null
  providerStatus: string | null
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
      payments: {
        select: {
          id: true,
          status: true,
          amountCents: true,
          paidAt: true,
          provider: true,
          providerPaymentId: true,
          providerStatus: true,
        },
      },
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

/**
 * Aplica UMA transição já validada a um Payment: revalida overpayment antes de aceitar
 * PAID, grava o Payment, registra o OrderEvent. NÃO sincroniza Order.paymentStatus — o
 * chamador faz isso, pois é ele quem sabe o array resultante de Payments.
 *
 * Não valida a máquina de estados nem permissões — quem chama já fez isso.
 */
async function writePaymentTransition(
  tx: Tx,
  args: {
    order: { id: string; totalCents: number; payments: PaymentRow[] }
    payment: PaymentRow
    toStatus: PaymentStatusValue
    note: string | null
    userId: string | null
    providerStatus?: string | null
  },
) {
  const { order, payment, toStatus } = args

  if (toStatus === 'PAID') {
    const others = order.payments.filter((p) => p.id !== payment.id)
    const summaryWithoutThis = summarizePayments(others, order.totalCents)
    if (payment.amountCents > summaryWithoutThis.remainingCents) {
      throw new PaymentServiceError(
        'Não é possível marcar como pago: o valor excederia o total do pedido.',
      )
    }
  }

  const data: Prisma.PaymentUpdateInput = {
    status: toStatus,
    paidAt: toStatus === 'PAID' ? (payment.paidAt ?? new Date()) : payment.paidAt,
  }
  if (args.providerStatus !== undefined) data.providerStatus = args.providerStatus

  const updated = await tx.payment.update({ where: { id: payment.id }, data })

  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      type: 'PAYMENT_STATUS_CHANGED',
      fromStatus: payment.status,
      toStatus,
      note: args.note,
      userId: args.userId,
    },
  })

  return updated
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
// Transição de status de um Payment existente (ação humana pelo admin)
// ---------------------------------------------------------------------------

export interface TransitionPaymentStatusInput {
  orderId: string
  paymentId: string
  toStatus: PaymentStatusValue
  note: string | null
  staff: StaffUser
}

/**
 * REFUNDED e CHARGEBACK exigem papel OWNER — em TODO caminho (manual e gateway).
 * Decisão de negócio fechada na Fase 4: nenhum staff comum pode estornar/registrar
 * chargeback, nem pelo caminho manual nem via reconsulta do Mercado Pago.
 */
function assertCanReverse(toStatus: PaymentStatusValue, staff: StaffUser) {
  if ((toStatus === 'REFUNDED' || toStatus === 'CHARGEBACK') && staff.role !== 'OWNER') {
    throw new PaymentServiceError(
      'Apenas o proprietário (OWNER) pode registrar estorno ou chargeback.',
    )
  }
}

/**
 * Transiciona o status de um Payment específico, validando a máquina de estados
 * (src/lib/payment-status.ts), o gate OWNER para REFUNDED/CHARGEBACK e revalidando
 * overpayment antes de aceitar PAID. Ao final, sempre resincroniza Order.paymentStatus
 * na mesma transação.
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
    // Autorização só depois de confirmar que a transição é estruturalmente válida.
    assertCanReverse(input.toStatus, input.staff)

    const updated = await writePaymentTransition(tx, {
      order,
      payment,
      toStatus: input.toStatus,
      note: input.note,
      userId: input.staff.id,
    })

    const nextPayments = order.payments.map((p) =>
      p.id === input.paymentId ? { ...p, status: input.toStatus } : p,
    )
    await syncOrderPaymentStatus(tx, input.orderId, order.totalCents, nextPayments)

    return updated
  })
}

// ---------------------------------------------------------------------------
// Atualização vinda do gateway (Mercado Pago) — webhook e reconsulta
// ---------------------------------------------------------------------------

export type GatewayApplyOutcome = 'applied' | 'noop' | 'owner_action_required' | 'conflict'

export interface GatewayApplyResult {
  outcome: GatewayApplyOutcome
  paymentStatus: PaymentStatusValue
  /** id interno do Payment criado/atualizado, quando houver. */
  paymentId?: string
}

export interface ApplyGatewayPaymentInput {
  orderId: string
  provider: string
  providerPaymentId: string
  /** status cru do gateway (ex.: "approved", "refunded"). */
  rawStatus: string
  /** status já traduzido pela máquina central; `null` = status desconhecido. */
  mappedStatus: PaymentStatusValue | null
  amountCents: number
  method: PaymentMethod
}

/**
 * Aplica ao domínio o que o gateway informou sobre UM pagamento.
 *
 * Regras:
 * - Idempotente: se o `providerStatus` já registrado é igual ao `rawStatus` recebido,
 *   não faz nada (notificações repetidas do Mercado Pago não duplicam efeito).
 * - Chave única (provider, providerPaymentId): cada pagamento do gateway vira no máximo
 *   um Payment interno. O lock do Order serializa webhooks concorrentes do mesmo pedido.
 * - Nunca cria uma segunda máquina de estados: PAID/PENDING/FAILED passam por
 *   `canTransition` + `writePaymentTransition` (mesma lógica do caminho manual).
 * - REFUNDED e CHARGEBACK NUNCA são aplicados aqui — exigem OWNER. O gateway apenas
 *   registra um OrderEvent sinalizando que o OWNER precisa confirmar o estorno.
 */
export async function applyGatewayPaymentUpdate(
  input: ApplyGatewayPaymentInput,
): Promise<GatewayApplyResult> {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId)
    const order = await loadOrderWithPayments(tx, input.orderId)

    const existing = order.payments.find(
      (p) => p.provider === input.provider && p.providerPaymentId === input.providerPaymentId,
    )

    const isReversal = input.mappedStatus === 'REFUNDED' || input.mappedStatus === 'CHARGEBACK'
    const note = `Mercado Pago: pagamento ${input.providerPaymentId} status "${input.rawStatus}".`

    // ---- Idempotência: já vimos exatamente este status cru para este pagamento ----
    if (existing && existing.providerStatus === input.rawStatus) {
      const summary = summarizePayments(order.payments, order.totalCents)
      return { outcome: 'noop', paymentStatus: summary.status, paymentId: existing.id }
    }

    // ---- Pagamento ainda desconhecido: cria o Payment interno ----
    if (!existing) {
      const summary = summarizePayments(order.payments, order.totalCents)

      let initialStatus: PaymentStatusValue
      if (input.mappedStatus === 'PENDING' || input.mappedStatus === null) initialStatus = 'PENDING'
      else if (input.mappedStatus === 'FAILED') initialStatus = 'FAILED'
      else initialStatus = 'PAID' // PAID, e também REFUNDED/CHARGEBACK: o dinheiro entrou

      // Não deixa o gateway criar um PAID que ultrapasse o total (ex.: já há pagamento
      // manual cobrindo o pedido). Nesse caso registra como PENDING para conferência.
      let conflict = false
      if (initialStatus === 'PAID' && input.amountCents > summary.remainingCents) {
        initialStatus = 'PENDING'
        conflict = true
      }

      const created = await tx.payment.create({
        data: {
          orderId: input.orderId,
          method: input.method,
          status: initialStatus,
          amountCents: input.amountCents,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerStatus: input.rawStatus,
          paidAt: initialStatus === 'PAID' ? new Date() : null,
        },
      })

      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: 'PAYMENT_STATUS_CHANGED',
          fromStatus: null,
          toStatus: initialStatus,
          note,
          userId: null,
        },
      })

      let outcome: GatewayApplyOutcome = 'applied'
      if (conflict) {
        outcome = 'conflict'
        await tx.orderEvent.create({
          data: {
            orderId: input.orderId,
            type: 'NOTE',
            note:
              `Mercado Pago confirmou o pagamento ${input.providerPaymentId}, mas o valor ` +
              `excede o saldo do pedido. Registrado como PENDENTE para conferência manual.`,
            userId: null,
          },
        })
      } else if (isReversal) {
        outcome = 'owner_action_required'
        await tx.orderEvent.create({
          data: {
            orderId: input.orderId,
            type: 'NOTE',
            note:
              `Mercado Pago reportou "${input.rawStatus}" para o pagamento ` +
              `${input.providerPaymentId}. Aplicar ${input.mappedStatus} exige confirmação do OWNER.`,
            userId: null,
          },
        })
      } else if (input.mappedStatus === null) {
        outcome = 'noop'
        await tx.orderEvent.create({
          data: {
            orderId: input.orderId,
            type: 'NOTE',
            note: `Mercado Pago: status "${input.rawStatus}" não é reconhecido — nenhum estado alterado.`,
            userId: null,
          },
        })
      }

      const summaryAfter = await syncOrderPaymentStatus(tx, input.orderId, order.totalCents, [
        ...order.payments,
        { status: initialStatus, amountCents: input.amountCents },
      ])
      return { outcome, paymentStatus: summaryAfter.status, paymentId: created.id }
    }

    // ---- Payment interno já existe: registra o novo status cru e decide ----
    await tx.payment.update({
      where: { id: existing.id },
      data: { providerStatus: input.rawStatus },
    })
    existing.providerStatus = input.rawStatus

    const finishNoop = async (extraNote?: string): Promise<GatewayApplyResult> => {
      if (extraNote) {
        await tx.orderEvent.create({
          data: { orderId: input.orderId, type: 'NOTE', note: extraNote, userId: null },
        })
      }
      const summary = await syncOrderPaymentStatus(
        tx,
        input.orderId,
        order.totalCents,
        order.payments,
      )
      return { outcome: 'noop', paymentStatus: summary.status, paymentId: existing.id }
    }

    if (input.mappedStatus === null) {
      return finishNoop(
        `Mercado Pago: status "${input.rawStatus}" não é reconhecido — nenhum estado alterado.`,
      )
    }

    if (isReversal) {
      await tx.orderEvent.create({
        data: {
          orderId: input.orderId,
          type: 'NOTE',
          note:
            `Mercado Pago reportou "${input.rawStatus}" para o pagamento ${input.providerPaymentId}. ` +
            `Aplicar ${input.mappedStatus} exige confirmação do OWNER.`,
          userId: null,
        },
      })
      const summary = await syncOrderPaymentStatus(
        tx,
        input.orderId,
        order.totalCents,
        order.payments,
      )
      return {
        outcome: 'owner_action_required',
        paymentStatus: summary.status,
        paymentId: existing.id,
      }
    }

    // mappedStatus ∈ { PAID, PENDING, FAILED }
    if (existing.status === input.mappedStatus) {
      return finishNoop()
    }
    if (!canTransition(existing.status, input.mappedStatus)) {
      return finishNoop(
        `Mercado Pago reportou "${input.rawStatus}", mas a transição ` +
          `${existing.status} → ${input.mappedStatus} não é permitida — ignorado.`,
      )
    }

    try {
      await writePaymentTransition(tx, {
        order,
        payment: existing,
        toStatus: input.mappedStatus,
        note,
        userId: null,
      })
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        // overpayment: outro pagamento já cobre o pedido.
        return finishNoop(
          `Mercado Pago confirmou o pagamento ${input.providerPaymentId}, mas ele já está ` +
            `coberto por outro pagamento do pedido — verificar duplicidade.`,
        )
      }
      throw err
    }

    const nextPayments = order.payments.map((p) =>
      p.id === existing.id ? { ...p, status: input.mappedStatus as PaymentStatusValue } : p,
    )
    const summary = await syncOrderPaymentStatus(
      tx,
      input.orderId,
      order.totalCents,
      nextPayments,
    )
    return { outcome: 'applied', paymentStatus: summary.status, paymentId: existing.id }
  })
}
