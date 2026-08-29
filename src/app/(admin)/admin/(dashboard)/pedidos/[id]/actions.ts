'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireStaff } from '@/server/guard'
import { canCancel, canTransition, type OrderStatusValue } from '@/lib/order-status'

export interface OrderActionState {
  error?: string
  ok?: boolean
}

/** Erro esperado de validação/negócio — vira mensagem segura para a UI. */
class ActionError extends Error {}

function revalidateOrder(id: string) {
  revalidatePath(`/admin/pedidos/${id}`)
  revalidatePath('/admin/pedidos')
  revalidatePath('/admin')
}

// ---------------------------------------------------------------------------
// Status do pedido (fluxo linear — CANCELED tem ação própria)
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  orderId: z.string().min(1),
  toStatus: z.enum(['DRAFT', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED']),
  note: z.string().trim().max(2000).optional(),
})

export async function updateOrderStatus(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireStaff()
  const parsed = statusSchema.safeParse({
    orderId: formData.get('orderId'),
    toStatus: formData.get('toStatus'),
    note: (formData.get('note') as string) || undefined,
  })
  if (!parsed.success) return { error: 'Dados inválidos.' }
  const { orderId, toStatus, note } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
      if (!order) throw new ActionError('Pedido não encontrado.')
      const from = order.status as OrderStatusValue

      if (toStatus === 'CANCELED') throw new ActionError('Use o cancelamento para cancelar o pedido.')
      if (from === toStatus) throw new ActionError('O pedido já está nesse status.')
      if (!canTransition(from, toStatus)) {
        throw new ActionError(`Transição não permitida: ${from} → ${toStatus}.`)
      }

      await tx.order.update({ where: { id: orderId }, data: { status: toStatus } })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'ORDER_STATUS_CHANGED',
          fromStatus: from,
          toStatus,
          note: note || null,
          userId: staff.id,
        },
      })
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[updateOrderStatus]', err)
    return { error: 'Não foi possível atualizar o status.' }
  }

  revalidateOrder(orderId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Cancelamento
// ---------------------------------------------------------------------------

const cancelSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(1, 'Informe o motivo do cancelamento.').max(2000),
})

export async function cancelOrder(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireStaff()
  const parsed = cancelSchema.safeParse({
    orderId: formData.get('orderId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { orderId, reason } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } })
      if (!order) throw new ActionError('Pedido não encontrado.')
      const from = order.status as OrderStatusValue

      if (from === 'CANCELED') throw new ActionError('O pedido já está cancelado.')
      if (!canCancel(from)) throw new ActionError('Este pedido não pode mais ser cancelado.')

      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELED' } })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'ORDER_STATUS_CHANGED',
          fromStatus: from,
          toStatus: 'CANCELED',
          note: `Cancelamento: ${reason}`,
          userId: staff.id,
        },
      })
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[cancelOrder]', err)
    return { error: 'Não foi possível cancelar o pedido.' }
  }

  revalidateOrder(orderId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Pagamento — altera SOMENTE o Payment existente + reflete em Order.paymentStatus
// (não cria Payment, não mexe em Order.status, sem gateway)
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  toStatus: z.enum([
    'PENDING',
    'PAID',
    'PARTIALLY_PAID',
    'REFUNDED',
    'CHARGEBACK',
    'FAILED',
    'CANCELED',
  ]),
  note: z.string().trim().max(2000).optional(),
})

export async function updatePaymentStatus(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireStaff()
  const parsed = paymentSchema.safeParse({
    orderId: formData.get('orderId'),
    paymentId: formData.get('paymentId'),
    toStatus: formData.get('toStatus'),
    note: (formData.get('note') as string) || undefined,
  })
  if (!parsed.success) return { error: 'Dados inválidos.' }
  const { orderId, paymentId, toStatus, note } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true, status: true, paidAt: true },
      })
      if (!payment || payment.orderId !== orderId) {
        throw new ActionError('Pagamento não encontrado para este pedido.')
      }
      const from = payment.status
      if (from === toStatus) throw new ActionError('O pagamento já está nesse status.')

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: toStatus,
          paidAt: toStatus === 'PAID' ? (payment.paidAt ?? new Date()) : payment.paidAt,
        },
      })
      // Um pedido do site tem exatamente um Payment — Order.paymentStatus acompanha.
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: toStatus } })
      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'PAYMENT_STATUS_CHANGED',
          fromStatus: from,
          toStatus,
          note: note || null,
          userId: staff.id,
        },
      })
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[updatePaymentStatus]', err)
    return { error: 'Não foi possível atualizar o pagamento.' }
  }

  revalidateOrder(orderId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Entrega — upsert do Shipment 1:1 (sem estoque, sem StockMovement)
// ---------------------------------------------------------------------------

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const shipmentSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['PENDING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELED']),
  carrier: optionalText(200),
  trackingCode: optionalText(200),
  estimatedAt: optionalDate,
  shippedAt: optionalDate,
  deliveredAt: optionalDate,
  notes: optionalText(2000),
})

export async function upsertShipment(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireStaff()
  const parsed = shipmentSchema.safeParse({
    orderId: formData.get('orderId'),
    status: formData.get('status'),
    carrier: (formData.get('carrier') as string) ?? '',
    trackingCode: (formData.get('trackingCode') as string) ?? '',
    estimatedAt: (formData.get('estimatedAt') as string) ?? '',
    shippedAt: (formData.get('shippedAt') as string) ?? '',
    deliveredAt: (formData.get('deliveredAt') as string) ?? '',
    notes: (formData.get('notes') as string) ?? '',
  })
  if (!parsed.success) return { error: 'Dados inválidos.' }
  const { orderId, status, carrier, trackingCode, estimatedAt, shippedAt, deliveredAt, notes } =
    parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, shipment: { select: { status: true } } },
      })
      if (!order) throw new ActionError('Pedido não encontrado.')
      const prevStatus = order.shipment?.status ?? null

      const data = { status, carrier, trackingCode, estimatedAt, shippedAt, deliveredAt, notes }
      await tx.shipment.upsert({
        where: { orderId },
        create: { orderId, ...data },
        update: data,
      })

      const detail = [
        `status=${status}`,
        carrier ? `transportadora=${carrier}` : null,
        trackingCode ? `rastreio=${trackingCode}` : null,
      ]
        .filter(Boolean)
        .join(', ')

      await tx.orderEvent.create({
        data: {
          orderId,
          type: 'NOTE',
          fromStatus: prevStatus,
          toStatus: status,
          note: `Entrega ${prevStatus ? 'atualizada' : 'registrada'}: ${detail}`,
          userId: staff.id,
        },
      })
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[upsertShipment]', err)
    return { error: 'Não foi possível salvar a entrega.' }
  }

  revalidateOrder(orderId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Nota interna — append-only em OrderEvent(NOTE)
// ---------------------------------------------------------------------------

const noteSchema = z.object({
  orderId: z.string().min(1),
  note: z.string().trim().min(1, 'Escreva a nota.').max(2000),
})

export async function addOrderNote(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const staff = await requireStaff()
  const parsed = noteSchema.safeParse({
    orderId: formData.get('orderId'),
    note: formData.get('note'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { orderId, note } = parsed.data

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } })
    if (!order) return { error: 'Pedido não encontrado.' }

    await prisma.orderEvent.create({
      data: { orderId, type: 'NOTE', note, userId: staff.id },
    })
  } catch (err) {
    console.error('[addOrderNote]', err)
    return { error: 'Não foi possível salvar a nota.' }
  }

  revalidateOrder(orderId)
  return { ok: true }
}
