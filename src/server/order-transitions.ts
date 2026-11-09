import 'server-only'
import type { Prisma } from '@prisma/client'
import { canCancel, canTransition, type OrderStatusValue } from '@/lib/order-status'
import { lockOrderRow } from '@/server/order-lock'
import {
  decrementStockForOrder,
  InsufficientStockError,
  lockProductsAndFindShortages,
  readOrderStockLedger,
  registerPhysicalReturn,
  restoreStockForOrder,
  ReturnQuantityError,
} from '@/server/stock'
import { pendingReturnByProduct } from '@/lib/stock'

// Regras de status e estoque do pedido. Cada função:
// 1. recebe a transação do chamador (`tx`) e NUNCA usa a conexão global;
// 2. trava a linha do pedido (`lockOrderRow`) como primeira operação;
// 3. relê status e itens pelo `tx`, já com a trava;
// 4. grava o novo status com `updateMany` condicionado ao status lido (exige 1 linha);
// 5. faz baixa/devolução pelo histórico do pedido, por produto (src/server/stock.ts).
//
// As actions do painel (autenticação, validação de formulário, WhatsApp) chamam só
// estas funções — nunca as de estoque diretamente.

type Tx = Prisma.TransactionClient

/** Erro esperado de regra de negócio — vira mensagem segura para a interface. */
export class OrderTransitionError extends Error {}

/** Status em que a mercadoria já saiu fisicamente da loja. */
const SHIPPED_STATUSES: readonly OrderStatusValue[] = ['SHIPPED', 'DELIVERED']

/** Pedidos que aceitam registro de retorno físico. */
const RETURNABLE_STATUSES: readonly OrderStatusValue[] = ['CANCELED', 'DELIVERED']

interface LockedOrder {
  status: OrderStatusValue
  number: number
  customerPhone: string | null
  items: { productId: string; productName: string; quantity: number }[]
}

async function lockAndLoad(tx: Tx, orderId: string): Promise<LockedOrder> {
  if (!(await lockOrderRow(tx, orderId))) throw new OrderTransitionError('Pedido não encontrado.')
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      number: true,
      customerPhone: true,
      items: { select: { productId: true, productName: true, quantity: true } },
    },
  })
  if (!order) throw new OrderTransitionError('Pedido não encontrado.')
  return { ...order, status: order.status as OrderStatusValue }
}

/** Grava o novo status só se ele ainda for `from`. Segunda barreira, além da trava. */
async function setStatusIfUnchanged(
  tx: Tx,
  orderId: string,
  from: OrderStatusValue,
  to: OrderStatusValue,
): Promise<void> {
  const result = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: to },
  })
  if (result.count !== 1) {
    throw new OrderTransitionError('O pedido foi alterado por outra operação. Recarregue a página.')
  }
}

export interface TransitionResult {
  number: number
  customerPhone: string | null
  from: OrderStatusValue
}

/**
 * Transição "para frente" (DRAFT→PENDING→CONFIRMED→PROCESSING→SHIPPED→DELIVERED).
 * A baixa de estoque acontece na entrada em CONFIRMED, por produto, uma única vez.
 */
export async function changeOrderStatusInTx(
  tx: Tx,
  input: { orderId: string; toStatus: OrderStatusValue; userId: string; note: string | null },
): Promise<TransitionResult> {
  const order = await lockAndLoad(tx, input.orderId)
  const from = order.status
  const to = input.toStatus

  if (to === 'CANCELED') throw new OrderTransitionError('Use o cancelamento para cancelar o pedido.')
  if (from === to) throw new OrderTransitionError('O pedido já está nesse status.')
  if (!canTransition(from, to)) {
    throw new OrderTransitionError(`Transição não permitida: ${from} → ${to}.`)
  }

  await setStatusIfUnchanged(tx, input.orderId, from, to)

  if (to === 'CONFIRMED') {
    try {
      await decrementStockForOrder(tx, order.items, { orderId: input.orderId, userId: input.userId })
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        throw new OrderTransitionError(
          `Não é possível confirmar: estoque insuficiente para "${err.productName}".`,
        )
      }
      throw err
    }
  }

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: 'ORDER_STATUS_CHANGED',
      fromStatus: from,
      toStatus: to,
      note: input.note,
      userId: input.userId,
    },
  })

  return { number: order.number, customerPhone: order.customerPhone, from }
}

// ---------------------------------------------------------------------------
// Confirmação automática por pagamento aprovado no Mercado Pago (Etapa D2).
// ---------------------------------------------------------------------------

export type GatewayConfirmationOutcome =
  | 'confirmed' // PENDING → CONFIRMED + baixa de estoque nesta transação
  | 'already_confirmed' // pedido já estava CONFIRMED ou adiante — nada alterado
  | 'order_canceled' // pedido CANCELED — não confirma; nota para o OWNER
  | 'not_pending' // DRAFT — não confirma; nota para o OWNER
  | 'insufficient_stock' // falta estoque — não confirma nem baixa; nota para o OWNER

export interface GatewayConfirmationResult {
  outcome: GatewayConfirmationOutcome
  number: number
  customerPhone: string | null
}

/**
 * Confirma o pedido cujo pagamento acabou de ser aprovado pelo Mercado Pago.
 * Chamada SÓ por `applyGatewayPaymentUpdate` (src/server/payments.ts), dentro da
 * mesma transação que gravou o pagamento — registro manual de PAID no painel nunca
 * passa por aqui.
 *
 * - Só PENDING é confirmado. CANCELED/DRAFT ficam como estão e geram nota para o
 *   OWNER; CONFIRMED ou adiante não muda (a baixa já aconteceu na confirmação).
 * - Estoque: trava os produtos e confere o saldo ANTES de mudar o status. Faltando
 *   qualquer item, não confirma, não baixa nada e registra a ocorrência — o
 *   pagamento continua gravado como pago.
 * - Status (`setStatusIfUnchanged`) e baixa (`decrementStockForOrder`, pelo
 *   histórico do pedido) usam as mesmas regras da confirmação manual. Qualquer
 *   erro inesperado desfaz a transação inteira, inclusive o pagamento.
 */
export async function confirmOrderAfterGatewayPaymentInTx(
  tx: Tx,
  input: { orderId: string; providerPaymentId: string },
): Promise<GatewayConfirmationResult> {
  const order = await lockAndLoad(tx, input.orderId)
  const base = { number: order.number, customerPhone: order.customerPhone }
  const approved = `Pagamento ${input.providerPaymentId} aprovado pelo Mercado Pago`

  const ownerNote = (note: string) =>
    tx.orderEvent.create({
      data: { orderId: input.orderId, type: 'NOTE', note: `ATENÇÃO (OWNER): ${note}`, userId: null },
    })

  if (order.status === 'CANCELED') {
    await ownerNote(
      `${approved}, mas o pedido está CANCELADO. Ele NÃO foi confirmado e o estoque NÃO foi ` +
        `baixado. Avaliar o estorno do pagamento.`,
    )
    return { ...base, outcome: 'order_canceled' }
  }
  if (order.status === 'DRAFT') {
    await ownerNote(
      `${approved}, mas o pedido está em RASCUNHO. Ele NÃO foi confirmado automaticamente; ` +
        `revise e confirme manualmente.`,
    )
    return { ...base, outcome: 'not_pending' }
  }
  if (order.status !== 'PENDING') return { ...base, outcome: 'already_confirmed' }

  const shortages = await lockProductsAndFindShortages(tx, order.items, { orderId: input.orderId })
  if (shortages.length > 0) {
    const list = shortages
      .map((s) => `${s.productName} (precisa ${s.required}, disponível ${s.available})`)
      .join('; ')
    await ownerNote(
      `${approved}, mas não há estoque suficiente para: ${list}. O pedido NÃO foi confirmado ` +
        `e o estoque NÃO foi baixado. Reponha o estoque e confirme o pedido manualmente, ou ` +
        `cancele o pedido e estorne o pagamento.`,
    )
    return { ...base, outcome: 'insufficient_stock' }
  }

  await setStatusIfUnchanged(tx, input.orderId, 'PENDING', 'CONFIRMED')
  // Produtos travados e saldo conferido acima: a baixa condicional não deve faltar.
  // Se faltar mesmo assim, o erro desfaz a transação inteira (sem confirmação parcial).
  await decrementStockForOrder(tx, order.items, { orderId: input.orderId, userId: null })

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: 'ORDER_STATUS_CHANGED',
      fromStatus: 'PENDING',
      toStatus: 'CONFIRMED',
      note:
        `Confirmado automaticamente após a aprovação do pagamento ${input.providerPaymentId} ` +
        `pelo Mercado Pago. Estoque baixado.`,
      userId: null,
    },
  })

  return { ...base, outcome: 'confirmed' }
}

/**
 * Cancelamento.
 * - Mercadoria ainda na loja (DRAFT, PENDING, CONFIRMED, PROCESSING): devolve ao
 *   estoque o que saiu e não voltou, por produto (0 se nada foi baixado).
 * - Mercadoria já enviada (SHIPPED): NÃO devolve. O pendente fica registrado no
 *   histórico e volta ao estoque só pelo registro de retorno físico.
 */
export async function cancelOrderInTx(
  tx: Tx,
  input: { orderId: string; reason: string; userId: string },
): Promise<TransitionResult & { awaitingReturn: boolean }> {
  const order = await lockAndLoad(tx, input.orderId)
  const from = order.status

  if (from === 'CANCELED') throw new OrderTransitionError('O pedido já está cancelado.')
  if (!canCancel(from)) throw new OrderTransitionError('Este pedido não pode mais ser cancelado.')

  await setStatusIfUnchanged(tx, input.orderId, from, 'CANCELED')

  const nameOf = new Map(order.items.map((i) => [i.productId, i.productName]))
  const describe = (list: Iterable<[string, number]>) =>
    [...list].map(([productId, qty]) => `${qty} un. de ${nameOf.get(productId) ?? productId}`).join(', ')

  let stockNote: string
  let awaitingReturn = false
  if (SHIPPED_STATUSES.includes(from)) {
    const pending = pendingReturnByProduct(await readOrderStockLedger(tx, input.orderId))
    awaitingReturn = pending.size > 0
    stockNote = awaitingReturn
      ? ` Estoque NÃO devolvido (mercadoria já enviada). Aguardando retorno físico: ${describe(pending)}.`
      : ''
  } else {
    const restored = await restoreStockForOrder(tx, {
      orderId: input.orderId,
      orderNumber: order.number,
      userId: input.userId,
    })
    stockNote = restored.length
      ? ` Devolvido ao estoque: ${describe(restored.map((r) => [r.productId, r.quantity]))}.`
      : ''
  }

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: 'ORDER_STATUS_CHANGED',
      fromStatus: from,
      toStatus: 'CANCELED',
      note: `Cancelamento: ${input.reason}${stockNote}`,
      userId: input.userId,
    },
  })

  return { number: order.number, customerPhone: order.customerPhone, from, awaitingReturn }
}

/**
 * Retorno físico de mercadoria enviada: parcial, por produto, ligado ao pedido e
 * limitado ao pendente. Registra o responsável na movimentação e no histórico.
 */
export async function registerOrderReturnInTx(
  tx: Tx,
  input: { orderId: string; productId: string; quantity: number; userId: string; note: string | null },
): Promise<{ pendingAfter: number }> {
  const order = await lockAndLoad(tx, input.orderId)
  if (!RETURNABLE_STATUSES.includes(order.status)) {
    throw new OrderTransitionError(
      'Retorno físico só pode ser registrado em pedidos cancelados após o envio ou entregues.',
    )
  }
  const item = order.items.find((i) => i.productId === input.productId)
  if (!item) throw new OrderTransitionError('Este produto não faz parte do pedido.')

  let result: { pendingBefore: number; pendingAfter: number }
  try {
    result = await registerPhysicalReturn(tx, {
      orderId: input.orderId,
      orderNumber: order.number,
      productId: input.productId,
      quantity: input.quantity,
      userId: input.userId,
      note: input.note,
    })
  } catch (err) {
    if (err instanceof ReturnQuantityError) throw new OrderTransitionError(err.message)
    throw err
  }

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: 'NOTE',
      note:
        `Retorno físico registrado: ${input.quantity} un. de ${item.productName} ` +
        `(pendente: ${result.pendingBefore} → ${result.pendingAfter}).` +
        (input.note ? ` ${input.note}` : ''),
      userId: input.userId,
    },
  })

  return { pendingAfter: result.pendingAfter }
}
