import 'server-only'
import { prisma } from '@/lib/prisma'

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

/** Leitura mínima para a página pública de confirmação (`/checkout/sucesso`). */
export async function getOrderConfirmation(number: number) {
  if (!Number.isInteger(number) || number <= 0) return null
  return prisma.order.findUnique({
    where: { number },
    select: {
      number: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      createdAt: true,
    },
  })
}
