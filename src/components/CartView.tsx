'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useCart } from '../context/useCart'
import { formatCents, formatPrice } from '../lib/format'
import { MAX_QTY_PER_LINE } from '../lib/stock'
import { buildCartMessage, buildWhatsAppUrl } from '../lib/whatsapp'
import { getCartPricing, type CartPricing } from '../app/(shop)/checkout/actions'
import ProductVisual from './ProductVisual'
import OrderSummary from './OrderSummary'
import QuantityStepper from './shop/QuantityStepper'
import { buttonClasses } from './shop/ui'

export default function CartView() {
  const { items, isHydrated, removeItem, updateQuantity, clearCart, totalPrice } = useCart()
  const [pricing, setPricing] = useState<CartPricing | null>(null)
  const [pricingLoading, setPricingLoading] = useState(true)

  const cartKey = useMemo(
    () => items.map((i) => `${i.product.id}:${i.quantity}`).join('|'),
    [items],
  )

  useEffect(() => {
    let active = true
    setPricingLoading(true)
    const payload = items.map((i) => ({ productId: i.product.id, quantity: i.quantity }))
    getCartPricing(payload)
      .then((result) => {
        if (active) setPricing(result)
      })
      .catch(() => {
        if (active) setPricing(null)
      })
      .finally(() => {
        if (active) setPricingLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  // Antes de ler o carrinho salvo no navegador: estado neutro (não "vazia").
  if (!isHydrated) {
    return (
      <div aria-busy="true" className="grid gap-10 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-5 border-b border-hairline pb-6">
              <div className="aspect-[4/5] w-24 bg-sand-100" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-3 w-24 bg-sand-100" />
                <div className="h-5 w-2/3 bg-sand-100" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Carregando sua sacola…</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 border-t border-hairline py-16">
        <p className="font-display text-4xl text-ink">Sua sacola está vazia.</p>
        <p className="text-sm text-ink-soft">Explore as coleções e adicione o que gostar.</p>
        <Link href="/#catalogo" className={buttonClasses('primary', 'md', 'mt-2')}>
          Explorar a loja
        </Link>
      </div>
    )
  }

  const lineById = new Map((pricing?.lines ?? []).map((l) => [l.productId, l]))
  const hasUnavailable = pricing?.hasUnavailable ?? false
  const hasInsufficientStock = pricing?.hasInsufficientStock ?? false
  const blocked = hasUnavailable || hasInsufficientStock
  // `null` sem número de WhatsApp válido configurado — o link some.
  const whatsappUrl = buildWhatsAppUrl(buildCartMessage(items, totalPrice))

  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-8">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {items.map((item) => {
            const line = lineById.get(item.product.id)
            const unavailable = line ? !line.available : false
            const insufficient = line?.insufficientStock ?? false
            // Teto do botão "+": estoque informado pelo servidor; sem ele, o snapshot local.
            const maxQty = Math.min(
              line?.availableQuantity ?? item.product.availableQuantity ?? MAX_QTY_PER_LINE,
              MAX_QTY_PER_LINE,
            )
            const lineTotal = line?.available
              ? formatCents(line.lineTotalCents)
              : formatPrice(item.product.price * item.quantity)

            return (
              <li key={item.product.id} className="flex gap-5 py-6">
                <Link
                  href={`/produto/${item.product.slug}`}
                  className="shrink-0"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <ProductVisual
                    product={item.product}
                    variant="thumb"
                    className={`aspect-[4/5] w-24 sm:w-28 ${unavailable ? 'opacity-50 grayscale' : ''}`}
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="eyebrow text-[0.625rem] text-ink-soft">{item.product.brand}</p>
                      <Link
                        href={`/produto/${item.product.slug}`}
                        className="mt-1 block font-display text-xl leading-snug text-ink hover:underline sm:text-2xl"
                      >
                        {item.product.name}
                      </Link>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {lineTotal}
                    </span>
                  </div>

                  {unavailable && (
                    <p className="mt-2 text-xs font-medium text-red-700">
                      Indisponível — remova para continuar.
                    </p>
                  )}
                  {insufficient && line && (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      {line.availableQuantity === 0
                        ? 'Esgotado — remova para continuar.'
                        : `Só ${line.availableQuantity} disponível(is) — ajuste a quantidade.`}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <QuantityStepper
                      value={item.quantity}
                      label={item.product.name}
                      onDecrease={() => updateQuantity(item.product.id, item.quantity - 1)}
                      onIncrease={() =>
                        updateQuantity(item.product.id, Math.min(item.quantity + 1, maxQty))
                      }
                      canIncrease={item.quantity < maxQty}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id)}
                      aria-label={`Remover ${item.product.name}`}
                      className="link-underline pb-0.5 text-xs text-ink-soft hover:text-ink"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={clearCart}
          className="mt-5 text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          Esvaziar sacola
        </button>
      </div>

      <aside
        aria-label="Resumo"
        className="h-fit bg-sand-50 p-6 sm:p-8 lg:sticky lg:top-32 lg:col-span-4"
      >
        <p className="eyebrow mb-4 text-ink-soft">Resumo</p>
        <div aria-busy={pricingLoading} className={pricingLoading ? 'opacity-60' : ''}>
          <OrderSummary
            subtotalCents={pricing?.subtotalCents ?? 0}
            discountCents={pricing?.discountCents ?? 0}
            shippingCents={pricing?.shippingCents ?? 0}
            totalCents={pricing?.totalCents ?? 0}
            shippingPendingLabel="calculado no checkout"
          />
        </div>

        {blocked ? (
          <p
            role="alert"
            className="mt-6 border-l-2 border-red-700 bg-ivory px-4 py-3 text-xs text-red-800"
          >
            {hasUnavailable
              ? 'Remova os itens indisponíveis para prosseguir.'
              : 'Ajuste as quantidades ao estoque disponível para prosseguir.'}
          </p>
        ) : (
          <Link href="/checkout" className={buttonClasses('primary', 'lg', 'mt-6 w-full')}>
            Ir para o checkout
          </Link>
        )}

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('outline', 'md', 'mt-3 w-full')}
          >
            Finalizar pelo WhatsApp
          </a>
        )}
      </aside>
    </div>
  )
}
