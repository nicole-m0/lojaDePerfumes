'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Minus, Plus, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react'
import type { Product } from '@/types'
import { useCart } from '@/context/useCart'
import { discountPercent, formatPrice } from '@/lib/format'
import { buildProductMessage, buildWhatsAppUrl } from '@/lib/whatsapp'
import ProductVisual from '@/components/ProductVisual'
import ProductCard from '@/components/ProductCard'

interface ProductDetailViewProps {
  product: Product
  related: Product[]
}

export default function ProductDetailView({ product, related }: ProductDetailViewProps) {
  const [quantity, setQuantity] = useState(1)
  const { addItem } = useCart()

  const discount = discountPercent(product.price, product.originalPrice)

  const handleAddToCart = () => {
    addItem(product, quantity)
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 sm:px-6">
      <nav className="flex items-center gap-1.5 py-4 text-xs text-neutral-400">
        <Link href="/" className="hover:text-venus-600">
          Início
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          href={`/?categoria=${encodeURIComponent(product.category)}`}
          className="hover:text-venus-600"
        >
          {product.category}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-neutral-600">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-venus-100">
          <ProductVisual
            product={product}
            className="aspect-square w-full"
            iconClassName="h-32 w-32 sm:h-40 sm:w-40"
          />
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-venus-500">
            {product.brand}
          </span>
          <h1 className="mt-1 text-2xl font-bold text-neutral-800 sm:text-3xl">{product.name}</h1>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="h-4 w-4"
                  fill={i < Math.round(product.rating) ? 'currentColor' : 'none'}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <span className="text-sm text-neutral-500">
              {product.rating.toFixed(1)} ({product.reviews} avaliações)
            </span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            {product.originalPrice && (
              <span className="text-base text-neutral-400 line-through">
                {formatPrice(product.originalPrice)}
              </span>
            )}
            <span className="text-3xl font-bold text-venus-600">{formatPrice(product.price)}</span>
            {discount && (
              <span className="rounded-full bg-venus-100 px-2.5 py-1 text-xs font-bold text-venus-700">
                -{discount}%
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            ou 3x de {formatPrice(product.price / 3)} sem juros
          </p>

          <p className="mt-5 text-sm leading-relaxed text-neutral-600">{product.description}</p>

          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-venus-100 bg-venus-50/40 p-4 sm:grid-cols-2">
            {product.specs.map((spec) => (
              <div key={spec.label} className="flex justify-between gap-2 text-sm sm:justify-start">
                <dt className="text-neutral-500">{spec.label}</dt>
                <dd className="font-medium text-neutral-700 sm:ml-auto">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-full border border-venus-200">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Diminuir quantidade"
                className="flex h-10 w-10 items-center justify-center rounded-full text-venus-600 transition hover:bg-venus-50"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold text-neutral-700">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Aumentar quantidade"
                className="flex h-10 w-10 items-center justify-center rounded-full text-venus-600 transition hover:bg-venus-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm text-neutral-500">
              Subtotal:{' '}
              <span className="font-semibold text-neutral-700">
                {formatPrice(product.price * quantity)}
              </span>
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleAddToCart}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-venus-500 to-venus-600 py-3.5 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
            >
              <ShoppingBag className="h-4.5 w-4.5" />
              Adicionar ao carrinho
            </button>
            <a
              href={buildWhatsAppUrl(buildProductMessage(product, quantity))}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#25D366] py-3.5 text-sm font-bold text-[#1a9c4b] transition hover:bg-[#25D366]/10"
            >
              Comprar via WhatsApp
            </a>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-venus-100 pt-5 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Truck className="h-4.5 w-4.5 text-venus-500" />
              Entrega para todo o Brasil
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <ShieldCheck className="h-4.5 w-4.5 text-venus-500" />
              Compra 100% segura
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 text-lg font-semibold text-neutral-800">Você também pode gostar</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
