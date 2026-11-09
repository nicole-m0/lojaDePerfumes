import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { formatPrice } from '@/lib/format'

// Primitivos visuais da loja pública (Etapa B.1 — direção editorial).
// Só apresentação: nenhum estado, dado ou regra de negócio mora aqui.

/** Largura e margens padrão das páginas da loja. */
export function Container({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-12 ${className}`}>
      {children}
    </div>
  )
}

export function Eyebrow({
  className = '',
  children,
  as: Tag = 'p',
}: {
  className?: string
  children: ReactNode
  as?: 'p' | 'span' | 'h2' | 'h3'
}) {
  return <Tag className={`eyebrow text-ink-soft ${className}`}>{children}</Tag>
}

type ButtonVariant = 'primary' | 'brand' | 'outline' | 'light'
type ButtonSize = 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  // Sólido em tinta: ação principal (comprar, finalizar).
  primary: 'bg-ink text-ivory hover:bg-brand-800 disabled:bg-sand-300 disabled:text-ivory',
  // Bordô: ações de destaque em fundos claros.
  brand: 'bg-brand-700 text-ivory hover:bg-brand-800 disabled:bg-sand-300',
  // Contorno fino: ação secundária.
  outline:
    'border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-ivory disabled:border-sand-200 disabled:text-ink/40 disabled:hover:bg-transparent',
  // Para fundos escuros (faixa editorial).
  light: 'bg-ivory text-ink hover:bg-sand-100',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-11 px-6',
  lg: 'h-13 px-8',
}

/** Classes do botão retangular da loja (sem cápsulas). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  return [
    'inline-flex items-center justify-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.16em]',
    'transition-colors duration-200 disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    extra,
  ].join(' ')
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}

/** Link de texto com sublinhado animado e seta. */
export function TextLink({ className = '', children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={`link-underline inline-flex items-center gap-1.5 pb-0.5 text-sm font-medium text-ink ${className}`}
      {...props}
    >
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  )
}

/** Preço com valor "de" riscado quando houver promoção. */
export function Price({
  price,
  originalPrice,
  muted = false,
  size = 'md',
  className = '',
}: {
  price: number
  originalPrice?: number
  muted?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const main = { sm: 'text-sm', md: 'text-[0.95rem]', lg: 'text-2xl' }[size]
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 tabular-nums ${className}`}>
      <span className={`${main} font-semibold ${muted ? 'text-ink-soft' : 'text-ink'}`}>
        {formatPrice(price)}
      </span>
      {originalPrice && (
        <span className="text-xs text-ink-soft line-through">
          <span className="sr-only">Preço anterior: </span>
          {formatPrice(originalPrice)}
        </span>
      )}
    </p>
  )
}
