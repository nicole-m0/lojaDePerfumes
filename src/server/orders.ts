import 'server-only'
import { prisma } from '@/lib/prisma'
import { createOrderAccessToken, verifyOrderAccessToken } from '@/lib/order-access'

// Camada de leitura de pedidos para o painel administrativo.
// As mutações administrativas (status, pagamento, entrega, notas, cancelamento)
// ficam nas Server Actions em `pedidos/[id]/actions.ts`.
// Criação de pedido é do checkout (loja). Gateway de pagamento e NF-e são fases futuras.

export async function listAdminOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      source: true,
      status: true,
      paymentStatus: true,
      customerName: true,
      totalCents: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  })
}

export async function getAdminOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      items: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      shipment: true,
      shippingQuote: true,
      invoices: { orderBy: { createdAt: 'desc' } },
      events: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      },
    },
  })
}

export async function countOrders() {
  return prisma.order.count()
}

/** Segredo dos tokens de confirmação de pedido — reaproveita o AUTH_SECRET. */
export function getOrderAccessSecret(): string | undefined {
  return process.env.AUTH_SECRET || undefined
}

/** Token que autoriza ver a confirmação do pedido (ver src/lib/order-access.ts). */
export function issueOrderAccessToken(orderId: string): string {
  return createOrderAccessToken(orderId, getOrderAccessSecret())
}

export interface OrderConfirmation {
  number: number
  paymentStatus: string
  totalCents: number
}

/**
 * Leitura mínima para a página pública de confirmação (`/checkout/sucesso`).
 *
 * O número do pedido é sequencial e NÃO autoriza nada sozinho: os dados só são
 * devolvidos com um `token` válido para aquele pedido. Qualquer falha (número
 * inválido, pedido inexistente, token ausente/errado, segredo não configurado)
 * devolve `null` — mesma resposta, para não revelar se o pedido existe.
 * Nunca retorna dados pessoais (nome, contato, endereço).
 */
export async function getOrderConfirmation(
  number: number,
  token: string | null | undefined,
): Promise<OrderConfirmation | null> {
  if (!Number.isInteger(number) || number <= 0) return null
  if (typeof token !== 'string' || token.length === 0) return null

  const order = await prisma.order.findUnique({
    where: { number },
    select: { id: true, number: true, paymentStatus: true, totalCents: true },
  })
  if (!order) return null
  if (!verifyOrderAccessToken(order.id, token, getOrderAccessSecret())) return null

  return {
    number: order.number,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
  }
}
