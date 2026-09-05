'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../context/useCart'
import { formatCents, formatPrice } from '../lib/format'
import { buildCartMessage, buildWhatsAppUrl } from '../lib/whatsapp'
import { getCartPricing, type CartPricing } from '../app/(shop)/checkout/actions'
import ProductVisual from './ProductVisual'
import OrderSummary from './OrderSummary'

export default function CartView() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart()
  const [pricing, setPricing] = useState<CartPricing | null>(null)

  const cartKey = useMemo(
    () => items.map((i) => `${i.product.id}:${i.quantity}`).join('|'),
    [items],
  )

  useEffect(() => {
    let active = true
    const payload = items.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
    getCartPricing(payload)
      .then((result) => {
        if (active) setPricing(result)
      })
      .catch(() => {
        if (active) setPricing(null)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-venus-100 bg-white py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-venus-50">
          <ShoppingBag className="h-7 w-7 text-venus-300" />
        </div>
        <p className="text-sm text-neutral-500">Seu carrinho está vazio.</p>
        <Link
          href="/"
          className="rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
        >
          Explorar produtos
        </Link>
      </div>
    )
  }

  const lineById = new Map((pricing?.lines ?? []).map((l) => [l.productId, l]))
  const hasUnavailable = pricing?.hasUnavailable ?? false

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-venus-50 rounded-2xl border border-venus-100 bg-white px-4">
        {items.map((item) => {
          const line = lineById.get(item.product.id)
          const unavailable = line ? !line.available : false
          const lineTotal = line?.available
            ? formatCents(line.lineTotalCents)
            : formatPrice(item.product.price * item.quantity)

          return (
            <li key={item.product.id} className="flex gap-3 py-4">
              <Link
                href={`/produto/${item.product.slug}`}
                className="shrink-0 overflow-hidden rounded-xl"
              >
                <ProductVisual product={item.product} className="h-20 w-20" iconClassName="h-8 w-8" />
              </Link>

              <div className="flex flex-1 flex-col gap-1">
                <Link
                  href={`/produto/${item.product.slug}`}
                  className="line-clamp-2 text-sm font-medium text-neutral-800 transition hover:text-venus-600"
                >
                  {item.product.name}
                </Link>

                {unavailable && (
                  <span className="w-fit rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                    Indisponível — remova para continuar
                  </span>
                )}

                <div className="mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-venus-100">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      aria-label="Diminuir quantidade"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-venus-600 transition hover:bg-venus-50"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-neutral-700">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.product.id, Math.min(item.quantity + 1, 99))
                      }
                      disabled={item.quantity >= 99}
                      aria-label="Aumentar quantidade"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-venus-600 transition hover:bg-venus-50 disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id)}
                    aria-label={`Remover ${item.product.name}`}
                    className="flex items-center gap-1 text-xs font-medium text-red-500 transition hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              </div>

              <span className="shrink-0 self-start text-sm font-bold text-venus-600">{lineTotal}</span>
            </li>
          )
        })}

        <li className="py-3">
          <button
            type="button"
            onClick={clearCart}
            className="text-xs font-medium text-neutral-400 transition hover:text-red-500"
          >
            Limpar carrinho
          </button>
        </li>
      </ul>

      <aside className="h-fit space-y-4 rounded-2xl border border-venus-100 bg-white p-5">
        <OrderSummary
          subtotalCents={pricing?.subtotalCents ?? 0}
          discountCents={pricing?.discountCents ?? 0}
          shippingCents={pricing?.shippingCents ?? 0}
          totalCents={pricing?.totalCents ?? 0}
        />

        {hasUnavailable ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Remova os itens indisponíveis para prosseguir.
          </p>
        ) : (
          <Link
            href="/checkout"
            className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-venus-500 to-venus-600 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
          >
            Ir para o checkout
          </Link>
        )}

        <a
          href={buildWhatsAppUrl(buildCartMessage(items, totalPrice))}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center rounded-full border border-venus-200 py-2.5 text-sm font-semibold text-venus-700 transition hover:bg-venus-50"
        >
          Finalizar pedido no WhatsApp
        </a>
      </aside>
    </div>
  )
}
