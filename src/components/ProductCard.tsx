import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '../types'
import { discountPercent, formatPrice } from '../lib/format'
import { useCart } from '../context/useCart'
import ProductVisual from './ProductVisual'

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart()
  const discount = discountPercent(product.price, product.originalPrice)

  return (
    <Link
      to={`/produto/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-venus-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-lg"
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <ProductVisual
          product={product}
          className="h-full w-full transition-transform duration-500 group-hover:scale-110"
          iconClassName="h-16 w-16"
        />
        {discount && (
          <span className="absolute left-3 top-3 rounded-full bg-venus-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            -{discount}%
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            addItem(product)
          }}
          aria-label={`Adicionar ${product.name} ao carrinho`}
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-venus-200 bg-white/90 text-venus-600 shadow-md backdrop-blur transition-all hover:scale-110 hover:bg-venus-600 hover:text-white"
        >
          <ShoppingBag className="h-4.5 w-4.5" strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-venus-500">
          {product.brand}
        </span>
        <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-tight text-neutral-800">
          {product.name}
        </h3>
        <div className="mt-auto pt-2">
          {product.originalPrice && (
            <span className="block text-xs text-neutral-400 line-through">
              {formatPrice(product.originalPrice)}
            </span>
          )}
          <span className="text-lg font-bold text-venus-600">{formatPrice(product.price)}</span>
        </div>
      </div>
    </Link>
  )
}
