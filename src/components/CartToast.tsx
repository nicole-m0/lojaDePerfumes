'use client'

import { X } from 'lucide-react'
import { useCart } from '../context/useCart'
import ProductVisual from './ProductVisual'

export default function CartToast() {
  const { notification, dismissNotification, openCart } = useCart()

  if (!notification) return null

  return (
    <div
      key={notification.id}
      role="status"
      className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 animate-[toast-in_0.25s_ease-out] sm:bottom-6 sm:left-auto sm:right-24 sm:translate-x-0"
    >
      <div className="flex items-center gap-4 border border-hairline bg-ivory p-3 pr-2 shadow-glow-lg">
        <ProductVisual
          product={notification.product}
          variant="thumb"
          className="aspect-[4/5] w-12 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <p className="eyebrow text-[0.625rem] text-ink-soft">Adicionado à sacola</p>
          <p className="mt-1 truncate font-display text-lg leading-tight text-ink">
            {notification.product.name}
          </p>
          <button
            type="button"
            onClick={() => {
              openCart()
              dismissNotification()
            }}
            className="link-underline mt-1 pb-0.5 text-xs font-semibold text-ink"
          >
            Ver sacola
          </button>
        </div>

        <button
          type="button"
          onClick={dismissNotification}
          aria-label="Fechar aviso"
          className="flex h-9 w-9 shrink-0 items-center justify-center self-start text-ink-soft hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
