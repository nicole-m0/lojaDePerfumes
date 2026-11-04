'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Minus, Plus } from 'lucide-react'
import type { Product } from '@/types'
import { useCart } from '@/context/useCart'
import { discountPercent, formatPrice } from '@/lib/format'
import { clampToAvailable, isOutOfStock } from '@/lib/stock'
import { buildProductMessage, buildWhatsAppUrl } from '@/lib/whatsapp'
import ProductVisual from '@/components/ProductVisual'
import ProductCard from '@/components/ProductCard'
import { Container, Eyebrow, Price, buttonClasses } from '@/components/shop/ui'

interface ProductDetailViewProps {
  product: Product
  related: Product[]
}

// Avaliações (rating/reviews) NÃO são exibidas: os números atuais vêm do catálogo
// de demonstração e não são avaliações reais de clientes. Os dados seguem no banco.
export default function ProductDetailView({ product, related }: ProductDetailViewProps) {
  const [quantity, setQuantity] = useState(1)
  const { addItem } = useCart()

  const discount = discountPercent(product.price, product.originalPrice)
  const maxQty = product.availableQuantity
  const soldOut = isOutOfStock(maxQty)
  const atMax = quantity >= maxQty

  const handleAddToCart = () => {
    if (soldOut) return
    addItem(product, clampToAvailable(quantity, maxQty))
  }

  return (
    <main className="flex-1 pb-28 lg:pb-0">
      <Container>
        <nav aria-label="Você está em" className="py-5">
          <ol className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <li>
              <Link href="/" className="link-underline pb-0.5 hover:text-ink">
                Início
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/?categoria=${encodeURIComponent(product.category)}`}
                className="link-underline pb-0.5 hover:text-ink"
              >
                {product.category}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink">
              {product.name}
            </li>
          </ol>
        </nav>
      </Container>

      <Container className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        {/* Imagem — sangra até a borda no celular */}
        <div className="-mx-5 sm:-mx-8 lg:col-span-7 lg:mx-0">
          <ProductVisual
            product={product}
            variant="detail"
            priority
            className={`aspect-[4/5] w-full ${soldOut ? 'opacity-70 grayscale' : ''}`}
          />
        </div>

        {/* Informações — fixas ao rolar no desktop */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-32">
            <Eyebrow>{product.brand}</Eyebrow>
            <h1 className="mt-3 text-4xl font-medium leading-[1.05] text-ink sm:text-5xl">
              {product.name}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Price
                price={product.price}
                originalPrice={product.originalPrice}
                size="lg"
                muted={soldOut}
              />
              {discount && !soldOut && (
                <span className="eyebrow border border-brand-700/30 px-2 py-1 text-[0.625rem] text-brand-700">
                  −{discount}%
                </span>
              )}
            </div>
            {!soldOut && (
              <p className="mt-1.5 text-xs text-ink-soft tabular-nums">
                ou 3x de {formatPrice(product.price / 3)} sem juros
              </p>
            )}

            <p className="mt-7 max-w-prose text-[0.95rem] leading-relaxed text-ink/85">
              {product.description}
            </p>

            {product.specs.length > 0 && (
              <dl className="mt-8 border-t border-hairline">
                {product.specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex justify-between gap-6 border-b border-hairline py-3 text-sm"
                  >
                    <dt className="text-ink-soft">{spec.label}</dt>
                    <dd className="text-right font-medium text-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {soldOut ? (
              <p
                role="status"
                className="mt-8 border border-ink/15 bg-sand-50 px-5 py-4 text-sm text-ink"
              >
                <span className="font-semibold">Esgotado.</span>{' '}
                <span className="text-ink-soft">Este produto está indisponível no momento.</span>
              </p>
            ) : (
              <div className="mt-8">
                <div className="flex items-stretch gap-3">
                  <div className="flex items-center border border-ink/25">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Diminuir quantidade"
                      className="flex h-13 w-11 items-center justify-center text-ink disabled:text-ink/30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className="w-8 text-center text-sm font-semibold tabular-nums text-ink"
                      aria-live="polite"
                      aria-label={`Quantidade: ${quantity}`}
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => clampToAvailable(q + 1, maxQty))}
                      disabled={atMax}
                      aria-label="Aumentar quantidade"
                      className="flex h-13 w-11 items-center justify-center text-ink disabled:text-ink/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className={buttonClasses('primary', 'lg', 'hidden flex-1 lg:inline-flex')}
                  >
                    Adicionar à sacola · {formatPrice(product.price * quantity)}
                  </button>
                </div>
                {atMax && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Quantidade máxima disponível: {maxQty}.
                  </p>
                )}
                <a
                  href={buildWhatsAppUrl(buildProductMessage(product, quantity))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline mt-5 inline-block pb-0.5 text-sm font-medium text-ink"
                >
                  Prefere comprar pelo WhatsApp? Fale com a loja →
                </a>
              </div>
            )}

            <div className="mt-10 border-t border-hairline">
              {[
                [
                  'Entrega',
                  'O frete é calculado no checkout a partir do CEP de entrega, com as opções e prazos disponíveis.',
                ],
                [
                  'Pagamento',
                  'As formas de pagamento disponíveis são apresentadas ao finalizar o pedido.',
                ],
                ['Dúvidas', 'Fale com a loja pelo WhatsApp antes ou depois da compra.'],
              ].map(([title, text]) => (
                <details key={title} className="group border-b border-hairline">
                  <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {title}
                    <Plus
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-45"
                    />
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed text-ink-soft">{text}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </Container>

      {related.length > 0 && (
        <section aria-labelledby="relacionados-titulo" className="mt-24 sm:mt-32">
          <Container>
            <div className="border-t border-hairline pt-10">
              <Eyebrow>Da mesma coleção</Eyebrow>
              <h2
                id="relacionados-titulo"
                className="mt-3 text-3xl font-medium text-ink sm:text-4xl"
              >
                Você também pode gostar
              </h2>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* Barra de compra fixa no celular/tablet */}
      {!soldOut && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-ivory/95 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ink-soft">{product.name}</p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {formatPrice(product.price * quantity)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              className={buttonClasses('primary', 'md', 'shrink-0')}
            >
              Adicionar à sacola
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
