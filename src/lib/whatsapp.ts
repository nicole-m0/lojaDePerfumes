import { STORE_NAME, STORE_WHATSAPP_NUMBER } from '../config/store'
import type { CartItem, Product } from '../types'
import { formatPrice } from './format'

/**
 * Único ponto que monta URLs `wa.me` da loja. Devolve `null` quando não há número
 * válido configurado (NEXT_PUBLIC_STORE_WHATSAPP_NUMBER) — quem chama oculta o link.
 * Sem `message`, gera o link de contato simples (sem texto).
 */
export function buildWhatsAppUrl(message?: string): string | null {
  if (!STORE_WHATSAPP_NUMBER) return null
  const base = `https://wa.me/${STORE_WHATSAPP_NUMBER}`
  return message === undefined ? base : `${base}?text=${encodeURIComponent(message)}`
}

export function buildCartMessage(items: CartItem[], total: number): string {
  const lines = items.map(
    (item) =>
      `• ${item.quantity}x ${item.product.name} — ${formatPrice(item.product.price * item.quantity)}`,
  )
  return [
    `Olá! Quero finalizar este pedido na ${STORE_NAME}:`,
    '',
    ...lines,
    '',
    `Total: ${formatPrice(total)}`,
  ].join('\n')
}

export function buildProductMessage(product: Product, quantity: number): string {
  return [
    `Olá! Tenho interesse neste produto da ${STORE_NAME}:`,
    '',
    `• ${quantity}x ${product.name} — ${formatPrice(product.price * quantity)}`,
  ].join('\n')
}
