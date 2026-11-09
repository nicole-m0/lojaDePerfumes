import Image from 'next/image'
import type { Product } from '../types'

// Imagem do produto.
//
// - Com foto aprovada (`product.imageUrl`): a foto, em `object-cover` sobre areia.
// - Sem foto: SUBSTITUTO TIPOGRÁFICO — uma "etiqueta" com a marca e o nome do
//   próprio produto. É deliberadamente honesto (não finge ser uma foto) e cada
//   produto tem o seu, então nunca há uma mesma imagem genérica representando
//   vários produtos. Os campos `gradient`/`icon` do banco não são mais usados
//   na loja (os dados continuam intactos).

type Variant = 'thumb' | 'card' | 'feature' | 'detail'

interface ProductVisualProps {
  product: Pick<Product, 'name' | 'brand' | 'imageUrl'>
  className?: string
  variant?: Variant
  /** Valor do atributo `sizes` da imagem (layout responsivo). */
  sizes?: string
  priority?: boolean
}

const DEFAULT_SIZES: Record<Variant, string> = {
  thumb: '96px',
  card: '(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 320px',
  feature: '(max-width: 1024px) 100vw, 50vw',
  detail: '(max-width: 1024px) 100vw, 58vw',
}

/** Iniciais das duas primeiras palavras significativas do nome (para miniaturas). */
export function productMonogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 1)
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase())
  return letters.join('') || '·'
}

export default function ProductVisual({
  product,
  className = '',
  variant = 'card',
  sizes,
  priority = false,
}: ProductVisualProps) {
  if (product.imageUrl) {
    return (
      <div className={`relative overflow-hidden bg-sand-100 ${className}`}>
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          priority={priority}
          sizes={sizes ?? DEFAULT_SIZES[variant]}
          className="object-cover"
        />
      </div>
    )
  }

  if (variant === 'thumb') {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-sand-100 ${className}`}
        role="img"
        aria-label={`${product.name} — imagem em produção`}
      >
        <span className="font-display text-xl font-medium italic text-ink-soft">
          {productMonogram(product.name)}
        </span>
      </div>
    )
  }

  const large = variant === 'detail' || variant === 'feature'

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-sand-100 ${className}`}
      role="img"
      aria-label={`${product.name} — imagem em produção`}
    >
      {/* Etiqueta: moldura fina, marca, nome e um filete champanhe. */}
      <div
        className={`flex flex-col items-center justify-center border border-ink/10 bg-ivory text-center ${
          large ? 'h-[62%] w-[56%] gap-4 px-6' : 'h-[64%] w-[66%] gap-2 px-3'
        }`}
      >
        <span className={`eyebrow text-ink-soft ${large ? '' : 'text-[0.55rem]'}`}>
          {product.brand}
        </span>
        <span
          className={`font-display font-medium italic leading-tight text-ink ${
            large ? 'text-3xl sm:text-4xl' : 'line-clamp-3 text-base sm:text-lg'
          }`}
        >
          {product.name}
        </span>
        <span className={`h-px bg-champagne-400 ${large ? 'w-12' : 'w-8'}`} />
        {large && <span className="eyebrow text-ink-soft">Imagem em produção</span>}
      </div>
    </div>
  )
}
