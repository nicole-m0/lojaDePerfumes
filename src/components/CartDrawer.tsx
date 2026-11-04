'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { useCart } from '../context/useCart'
import { formatPrice } from '../lib/format'
import { clampToAvailable, MAX_QTY_PER_LINE } from '../lib/stock'
import { buildCartMessage, buildWhatsAppUrl } from '../lib/whatsapp'
import ProductVisual from './ProductVisual'
import QuantityStepper from './shop/QuantityStepper'
import { buttonClasses } from './shop/ui'

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalPrice, clearCart } = useCart()

  // Esc fecha a sacola.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCart()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, closeCart])

  return (
    <>
      <div
        onClick={closeCart}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-ink/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="sacola-titulo"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-ivory transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-6 py-5">
          <h2 id="sacola-titulo" className="text-3xl font-medium text-ink">
            Sacola
            {items.length > 0 && (
              <span className="ml-2 align-middle font-sans text-sm font-normal tabular-nums text-ink-soft">
                ({items.reduce((n, i) => n + i.quantity, 0)})
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Fechar sacola"
            className="-mr-2 flex h-10 w-10 items-center justify-center text-ink"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6">
            <p className="font-display text-3xl text-ink">Sua sacola está vazia.</p>
            <p className="text-sm text-ink-soft">Explore as coleções e adicione o que gostar.</p>
            <Link
              href="/#catalogo"
              onClick={closeCart}
              className={buttonClasses('primary', 'md', 'mt-2')}
            >
              Explorar a loja
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-hairline overflow-y-auto px-6">
              {items.map((item) => (
                <li key={item.product.id} className="flex gap-4 py-5">
                  <Link
                    href={`/produto/${item.product.slug}`}
                    onClick={closeCart}
                    className="shrink-0"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <ProductVisual
                      product={item.product}
                      variant="thumb"
                      className="aspect-[4/5] w-20"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="eyebrow text-[0.625rem] text-ink-soft">{item.product.brand}</p>
                    <Link
                      href={`/produto/${item.product.slug}`}
                      onClick={closeCart}
                      className="mt-1 line-clamp-2 font-display text-lg leading-snug text-ink hover:underline"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-ink">
                      {formatPrice(item.product.price * item.quantity)}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <QuantityStepper
                        value={item.quantity}
                        label={item.product.name}
                        onDecrease={() => updateQuantity(item.product.id, item.quantity - 1)}
                        onIncrease={() => updateQuantity(item.product.id, item.quantity + 1)}
                        canIncrease={
                          item.quantity <
                          clampToAvailable(MAX_QTY_PER_LINE, item.product.availableQuantity)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        aria-label={`Remover ${item.product.name} da sacola`}
                        className="link-underline pb-0.5 text-xs text-ink-soft hover:text-ink"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-hairline bg-sand-50 px-6 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-soft">Subtotal</span>
                <span className="text-lg font-semibold tabular-nums text-ink">
                  {formatPrice(totalPrice)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Frete e valores finais são confirmados no checkout.
              </p>
              <Link
                href="/checkout"
                onClick={closeCart}
                className={buttonClasses('primary', 'lg', 'mt-5 w-full')}
              >
                Finalizar compra
              </Link>
              <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                <Link
                  href="/carrinho"
                  onClick={closeCart}
                  className="link-underline pb-0.5 font-medium text-ink"
                >
                  Ver sacola completa
                </Link>
                <a
                  href={buildWhatsAppUrl(buildCartMessage(items, totalPrice))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline pb-0.5 font-medium text-ink"
                >
                  Finalizar no WhatsApp
                </a>
              </div>
              <button
                type="button"
                onClick={clearCart}
                className="mt-4 text-xs text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Esvaziar sacola
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
