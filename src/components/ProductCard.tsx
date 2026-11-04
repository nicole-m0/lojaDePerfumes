'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Product } from '../types'
import { discountPercent } from '../lib/format'
import { useCart } from '../context/useCart'
import { isOutOfStock } from '../lib/stock'
import ProductVisual from './ProductVisual'
import { Price } from './shop/ui'

interface ProductCardProps {
  product: Product
  /** `feature`: peça de destaque (imagem maior, nome maior). */
  variant?: 'default' | 'feature'
  className?: string
}

// Produto sem "caixa": imagem 4:5, marca, nome em serifa e preço. A ação rápida
// de adicionar fica sobre a imagem (sempre visível no celular; no desktop aparece
// no hover/foco). Esgotado: etiqueta, imagem esmaecida e sem ação de compra.
export default function ProductCard({
  product,
  variant = 'default',
  className = '',
}: ProductCardProps) {
  const { addItem } = useCart()
  const discount = discountPercent(product.price, product.originalPrice)
  const soldOut = isOutOfStock(product.availableQuantity)
  const feature = variant === 'feature'

  return (
    <article className={`group relative flex flex-col ${className}`}>
      <div className="relative overflow-hidden bg-sand-100">
        <Link
          href={`/produto/${product.slug}`}
          className="block"
          aria-label={`${product.name}${soldOut ? ' (esgotado)' : ''}`}
          tabIndex={-1}
        >
          <ProductVisual
            product={product}
            variant={feature ? 'feature' : 'card'}
            className={`aspect-[4/5] w-full transition-transform duration-700 ease-out group-hover:scale-[1.03] ${
              soldOut ? 'opacity-55 grayscale' : ''
            }`}
          />
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {soldOut ? (
            <span className="eyebrow bg-ink px-2 py-1 text-[0.625rem] text-ivory">Esgotado</span>
          ) : (
            discount && (
              <span className="eyebrow bg-ivory px-2 py-1 text-[0.625rem] text-brand-700">
                −{discount}%
              </span>
            )
          )}
        </div>

        {!soldOut && (
          <button
            type="button"
            onClick={() => addItem(product)}
            aria-label={`Adicionar ${product.name} à sacola`}
            className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center bg-ivory text-ink transition-colors hover:bg-ink hover:text-ivory lg:h-auto lg:w-auto lg:translate-y-full lg:gap-2 lg:px-4 lg:py-3 lg:opacity-0 lg:group-focus-within:translate-y-0 lg:group-focus-within:opacity-100 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:transition-all"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span className="hidden text-[0.6875rem] font-semibold uppercase tracking-[0.16em] lg:inline">
              Adicionar
            </span>
          </button>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${feature ? 'pt-5' : 'pt-4'}`}>
        <p className="eyebrow text-[0.625rem] text-ink-soft">{product.brand}</p>
        <h3
          className={`mt-1.5 font-display font-medium leading-snug text-ink ${
            feature ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'
          }`}
        >
          <Link
            href={`/produto/${product.slug}`}
            className="decoration-ink/30 underline-offset-4 hover:underline"
          >
            {product.name}
          </Link>
        </h3>
        <Price
          price={product.price}
          originalPrice={product.originalPrice}
          muted={soldOut}
          className="mt-2"
        />
        {soldOut && <p className="mt-1 text-xs text-ink-soft">Indisponível no momento</p>}
      </div>
    </article>
  )
}
