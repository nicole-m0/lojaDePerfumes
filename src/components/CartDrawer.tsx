// comandos no chat gpt...
import { Link } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useCart } from '../context/useCart'
import { formatPrice } from '../lib/format'
import { buildCartMessage, buildWhatsAppUrl } from '../lib/whatsapp'
import ProductVisual from './ProductVisual'

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalPrice, clearCart } =
    useCart()

  return (
    <>
      <div
        onClick={closeCart}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-label="Carrinho de compras"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-venus-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-800">
            <ShoppingBag className="h-5 w-5 text-venus-600" />
            Carrinho
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Fechar carrinho"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-venus-50 hover:text-venus-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-venus-50">
              <ShoppingBag className="h-7 w-7 text-venus-300" />
            </div>
            <p className="text-sm text-neutral-500">Seu carrinho está vazio.</p>
            <Link
              to="/"
              onClick={closeCart}
              className="rounded-full bg-venus-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-venus-700"
            >
              Explorar produtos
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-5 py-4">
              {items.map((item) => (
                <li
                  key={item.product.id}
                  className="flex gap-3 border-b border-venus-50 py-4 first:pt-0 last:border-none"
                >
                  <Link
                    to={`/produto/${item.product.slug}`}
                    onClick={closeCart}
                    className="shrink-0 overflow-hidden rounded-xl"
                  >
                    <ProductVisual product={item.product} className="h-20 w-20" iconClassName="h-8 w-8" />
                  </Link>

                  <div className="flex flex-1 flex-col gap-1">
                    <Link
                      to={`/produto/${item.product.slug}`}
                      onClick={closeCart}
                      className="line-clamp-2 text-sm font-medium text-neutral-800 transition hover:text-venus-600"
                    >
                      {item.product.name}
                    </Link>

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
                        <span className="w-5 text-center text-sm font-medium text-neutral-700">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          aria-label="Aumentar quantidade"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-venus-600 transition hover:bg-venus-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        aria-label={`Remover ${item.product.name} do carrinho`}
                        className="flex items-center gap-1 text-xs font-medium text-red-500 transition hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </button>
                    </div>
                  </div>

                  <span className="shrink-0 self-start text-sm font-bold text-venus-600">
                    {formatPrice(item.product.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-venus-100 px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-medium text-neutral-400 transition hover:text-red-500"
                >
                  Limpar carrinho
                </button>
                <div className="text-right">
                  <span className="block text-xs text-neutral-400">Total</span>
                  <span className="text-xl font-bold text-venus-600">{formatPrice(totalPrice)}</span>
                </div>
              </div>
              <a
                href={buildWhatsAppUrl(buildCartMessage(items, totalPrice))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-venus-500 to-venus-600 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
              >
                Finalizar pedido no WhatsApp
              </a>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
