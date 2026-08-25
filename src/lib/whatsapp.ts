import { STORE_WHATSAPP_NUMBER } from '../config/store'
import type { CartItem, Product } from '../types'
import { formatPrice } from './format'

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export function buildCartMessage(items: CartItem[], total: number): string {
  const lines = items.map(
    (item) =>
      `• ${item.quantity}x ${item.product.name} — ${formatPrice(item.product.price * item.quantity)}`,
  )
  return [
    'Olá! Quero finalizar este pedido na Loja Vênus:',
    '',
    ...lines,
    '',
    `Total: ${formatPrice(total)}`,
  ].join('\n')
}

export function buildProductMessage(product: Product, quantity: number): string {
  return [
    'Olá! Tenho interesse neste produto da Loja Vênus:',
    '',
    `• ${quantity}x ${product.name} — ${formatPrice(product.price * quantity)}`,
  ].join('\n')
}
