import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  pendingReturnByProduct,
  quantitiesToDecrement,
  requiredQuantityByProduct,
  summarizeOrderStockLedger,
  type OrderStockBalance,
} from '@/lib/stock'

type Tx = Prisma.TransactionClient

export class InsufficientStockError extends Error {
  constructor(
    public productId: string,
    public productName: string,
  ) {
    super(`Estoque insuficiente para "${productName}".`)
  }
}

interface OrderItemForStock {
  productId: string
  productName: string
  quantity: number
}

// ---------------------------------------------------------------------------
// Estoque ligado a pedido. TODAS as funções abaixo:
// - recebem a transação do chamador (`tx`) e nunca usam a conexão global;
// - exigem que o chamador já tenha travado a linha do pedido (`lockOrderRow`), o que
//   serializa confirmação, cancelamento e retorno do MESMO pedido;
// - decidem pelo histórico de movimentações do pedido, POR PRODUTO — não pelo status.
// ---------------------------------------------------------------------------

/** Lê, dentro da transação, as saídas por venda e as devoluções do pedido por produto. */
export async function readOrderStockLedger(
  tx: Tx,
  orderId: string,
): Promise<Map<string, OrderStockBalance>> {
  const movements = await tx.stockMovement.findMany({
    where: { orderId, OR: [{ type: 'OUTBOUND', reason: 'SALE' }, { type: 'RETURN' }] },
    select: { productId: true, type: true, reason: true, quantity: true },
  })
  return summarizeOrderStockLedger(movements)
}

/**
 * Baixa de estoque da confirmação do pedido. Por produto, baixa só o que ainda não
 * saiu (`pedido(p) − saiu(p)`) — chamar de novo não baixa nada. Linhas repetidas do
 * mesmo produto são somadas. A baixa é condicional (`stockOnHand >= quantidade`):
 * sem saldo, lança e a transação inteira é revertida.
 */
export async function decrementStockForOrder(
  tx: Tx,
  items: OrderItemForStock[],
  ctx: { orderId: string; userId: string | null },
): Promise<void> {
  const ledger = await readOrderStockLedger(tx, ctx.orderId)
  const toTake = quantitiesToDecrement(requiredQuantityByProduct(items), ledger)
  const nameOf = new Map(items.map((i) => [i.productId, i.productName]))

  for (const [productId, quantity] of toTake) {
    const result = await tx.product.updateMany({
      where: { id: productId, stockOnHand: { gte: quantity } },
      data: { stockOnHand: { decrement: quantity } },
    })
    if (result.count === 0) {
      throw new InsufficientStockError(productId, nameOf.get(productId) ?? productId)
    }
    await tx.stockMovement.create({
      data: {
        productId,
        type: 'OUTBOUND',
        reason: 'SALE',
        quantity,
        orderId: ctx.orderId,
        userId: ctx.userId,
      },
    })
  }
}

/**
 * Devolução automática no cancelamento (mercadoria que nunca saiu da loja). Por
 * produto, devolve só o que saiu e ainda não voltou (`saiu(p) − voltou(p)`) —
 * chamar de novo não devolve nada. Devolve a lista do que foi devolvido.
 */
export async function restoreStockForOrder(
  tx: Tx,
  ctx: { orderId: string; orderNumber: number; userId: string | null },
): Promise<{ productId: string; quantity: number }[]> {
  const pending = pendingReturnByProduct(await readOrderStockLedger(tx, ctx.orderId))
  const restored: { productId: string; quantity: number }[] = []
  for (const [productId, quantity] of pending) {
    await tx.product.update({
      where: { id: productId },
      data: { stockOnHand: { increment: quantity } },
    })
    await tx.stockMovement.create({
      data: {
        productId,
        type: 'RETURN',
        reason: 'OTHER',
        quantity,
        orderId: ctx.orderId,
        userId: ctx.userId,
        note: `Devolução por cancelamento do pedido #${ctx.orderNumber}`,
      },
    })
    restored.push({ productId, quantity })
  }
  return restored
}

export class ReturnQuantityError extends Error {}

/**
 * Retorno FÍSICO de mercadoria já enviada (pedido cancelado depois do envio, ou
 * entregue e devolvido pelo cliente). Parcial por produto, limitado ao que saiu e
 * ainda não voltou — registros repetidos ou simultâneos nunca devolvem a mais.
 */
export async function registerPhysicalReturn(
  tx: Tx,
  input: {
    orderId: string
    orderNumber: number
    productId: string
    quantity: number
    userId: string
    note: string | null
  },
): Promise<{ pendingBefore: number; pendingAfter: number }> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ReturnQuantityError('Informe uma quantidade inteira maior que zero.')
  }
  const pending = pendingReturnByProduct(await readOrderStockLedger(tx, input.orderId))
  const pendingBefore = pending.get(input.productId) ?? 0
  if (pendingBefore === 0) {
    throw new ReturnQuantityError('Não há unidades deste produto pendentes de retorno neste pedido.')
  }
  if (input.quantity > pendingBefore) {
    throw new ReturnQuantityError(
      `Quantidade maior que a pendente de retorno (${pendingBefore} unidade(s)).`,
    )
  }

  await tx.product.update({
    where: { id: input.productId },
    data: { stockOnHand: { increment: input.quantity } },
  })
  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      type: 'RETURN',
      reason: 'CUSTOMER_RETURN',
      quantity: input.quantity,
      orderId: input.orderId,
      userId: input.userId,
      note:
        `Retorno físico do pedido #${input.orderNumber}` + (input.note ? ` — ${input.note}` : ''),
    },
  })
  return { pendingBefore, pendingAfter: pendingBefore - input.quantity }
}

/** Leitura para a página do pedido: pendente de retorno por produto (fora de transação). */
export async function getOrderPendingReturns(orderId: string): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: { orderId, OR: [{ type: 'OUTBOUND', reason: 'SALE' }, { type: 'RETURN' }] },
    select: { productId: true, type: true, reason: true, quantity: true },
  })
  return pendingReturnByProduct(summarizeOrderStockLedger(movements))
}

// --- Leitura / gestão manual (painel /admin/estoque) ---------------------

export async function getProductForStock(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stockOnHand: true, status: true },
  })
}

export async function listStockMovements(productId: string) {
  return prisma.stockMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      order: { select: { number: true } },
    },
  })
}

interface ManualEntryInput {
  productId: string
  // CUSTOMER_RETURN fica de fora: só o retorno físico do pedido grava esse motivo.
  reason: 'PURCHASE' | 'INVENTORY_COUNT' | 'OTHER'
  quantity: number
  note: string | null
  userId: string
}

export async function registerManualEntry(input: ManualEntryInput): Promise<void> {
  await prisma.$transaction([
    prisma.product.update({
      where: { id: input.productId },
      data: { stockOnHand: { increment: input.quantity } },
    }),
    prisma.stockMovement.create({
      data: {
        productId: input.productId,
        type: 'INBOUND',
        reason: input.reason,
        quantity: input.quantity,
        userId: input.userId,
        note: input.note,
      },
    }),
  ])
}

interface ManualExitInput {
  productId: string
  productName: string
  reason: 'LOSS' | 'OTHER'
  quantity: number
  note: string | null
  userId: string
}

export async function registerManualExit(input: ManualExitInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.product.updateMany({
      where: { id: input.productId, stockOnHand: { gte: input.quantity } },
      data: { stockOnHand: { decrement: input.quantity } },
    })
    if (result.count === 0) {
      throw new InsufficientStockError(input.productId, input.productName)
    }
    await tx.stockMovement.create({
      data: {
        productId: input.productId,
        type: 'OUTBOUND',
        reason: input.reason,
        quantity: input.quantity,
        userId: input.userId,
        note: input.note,
      },
    })
  })
}

interface AdjustmentInput {
  productId: string
  newQuantity: number
  reason: 'MANUAL_ADJUSTMENT' | 'INVENTORY_COUNT'
  note: string | null
  userId: string
}

/** Ajuste por contagem física: informa-se o novo saldo; a diferença é calculada e registrada. */
export async function adjustStockToQuantity(input: AdjustmentInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { stockOnHand: true },
    })
    if (!product) throw new Error('Produto não encontrado.')

    const delta = input.newQuantity - product.stockOnHand
    if (delta === 0) return

    await tx.product.update({
      where: { id: input.productId },
      data: { stockOnHand: input.newQuantity },
    })
    await tx.stockMovement.create({
      data: {
        productId: input.productId,
        type: 'ADJUSTMENT',
        reason: input.reason,
        quantity: Math.abs(delta),
        userId: input.userId,
        note: input.note,
      },
    })
  })
}
