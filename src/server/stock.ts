import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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

/**
 * Baixa de estoque por confirmação de pedido — condicional e atômica por item
 * (`WHERE stockOnHand >= quantity`), dentro da transação do chamador. Se algum
 * item não tiver saldo suficiente, lança e a transação inteira é revertida
 * (nenhum item fica parcialmente decrementado).
 */
export async function decrementStockForOrder(
  tx: Tx,
  items: OrderItemForStock[],
  ctx: { orderId: string; userId: string },
): Promise<void> {
  for (const item of items) {
    const result = await tx.product.updateMany({
      where: { id: item.productId, stockOnHand: { gte: item.quantity } },
      data: { stockOnHand: { decrement: item.quantity } },
    })
    if (result.count === 0) {
      throw new InsufficientStockError(item.productId, item.productName)
    }
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: 'OUTBOUND',
        reason: 'SALE',
        quantity: item.quantity,
        orderId: ctx.orderId,
        userId: ctx.userId,
      },
    })
  }
}

/**
 * Devolução de estoque por cancelamento — só deve ser chamada quando o pedido
 * já havia sido confirmado (ou seja, quando `decrementStockForOrder` já rodou
 * para ele). Sem enum de motivo dedicado ainda: usa RETURN/OTHER + nota.
 */
export async function restoreStockForOrder(
  tx: Tx,
  items: OrderItemForStock[],
  ctx: { orderId: string; orderNumber: number; userId: string },
): Promise<void> {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stockOnHand: { increment: item.quantity } },
    })
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: 'RETURN',
        reason: 'OTHER',
        quantity: item.quantity,
        orderId: ctx.orderId,
        userId: ctx.userId,
        note: `Devolução por cancelamento do pedido #${ctx.orderNumber}`,
      },
    })
  }
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
  reason: 'PURCHASE' | 'CUSTOMER_RETURN' | 'INVENTORY_COUNT' | 'OTHER'
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
