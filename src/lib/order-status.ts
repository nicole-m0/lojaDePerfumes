// Máquina de estados do pedido — função pura e testável.
// Validada SEMPRE no servidor; o cliente nunca é fonte da verdade.

export type OrderStatusValue =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELED'

export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PROCESSING: 'Em preparação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
}

// Fluxo linear aprovado + cancelamento.
// DELIVERED é terminal; CANCELED é terminal.
const TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  DRAFT: ['PENDING', 'CANCELED'],
  PENDING: ['CONFIRMED', 'CANCELED'],
  CONFIRMED: ['PROCESSING', 'CANCELED'],
  PROCESSING: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERED', 'CANCELED'],
  DELIVERED: [],
  CANCELED: [],
}

export function nextStatuses(from: OrderStatusValue): OrderStatusValue[] {
  return TRANSITIONS[from] ?? []
}

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return nextStatuses(from).includes(to)
}

/** Status "para frente" (exclui CANCELED, que tem controle próprio na UI). */
export function forwardStatuses(from: OrderStatusValue): OrderStatusValue[] {
  return nextStatuses(from).filter((s) => s !== 'CANCELED')
}

export function canCancel(from: OrderStatusValue): boolean {
  return canTransition(from, 'CANCELED')
}
