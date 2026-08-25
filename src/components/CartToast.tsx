import { CheckCircle2, X } from 'lucide-react'
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
      <div className="flex items-center gap-3 rounded-2xl border border-venus-100 bg-white p-3 shadow-glow-lg">
        <div className="flex shrink-0 items-center justify-center">
          <ProductVisual
            product={notification.product}
            className="h-12 w-12 rounded-lg"
            iconClassName="h-5 w-5"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Adicionado ao carrinho
          </p>
          <p className="truncate text-sm text-neutral-700">{notification.product.name}</p>
          <button
            type="button"
            onClick={() => {
              openCart()
              dismissNotification()
            }}
            className="mt-0.5 text-sm font-bold text-venus-600 hover:text-venus-700 hover:underline"
          >
            Ver no carrinho
          </button>
        </div>

        <button
          type="button"
          onClick={dismissNotification}
          aria-label="Fechar notificação"
          className="shrink-0 rounded-full p-1 text-neutral-400 transition hover:bg-venus-50 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
