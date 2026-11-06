// Identidade Bella&Cheirosa — símbolo e logotipo originais.
//
// Símbolo: frasco de perfume geométrico (tampa + gargalo + corpo arredondado)
// com um brilho de quatro pontas no centro, sugerindo a fragrância. Desenhado
// do zero em SVG; o mesmo desenho é usado no favicon (src/app/icon.svg) e no
// ícone Apple (src/app/apple-icon.tsx).
//
// Logotipo: "Bella&Cheirosa" em Cormorant Garamond, com o "&" em itálico
// champanhe. Texto real (não imagem): acessível e nítido em qualquer tamanho.

/** Caminho do brilho central do frasco (viewBox 32×32). */
export const BRAND_SPARKLE_PATH =
  'M16 14.5c.55 3.2 1.55 4.2 4.75 4.75-3.2.55-4.2 1.55-4.75 4.75-.55-3.2-1.55-4.2-4.75-4.75 3.2-.55 4.2-1.55 4.75-4.75Z'

interface BrandMarkProps {
  className?: string
  /** Cor do contorno do frasco. */
  bottleColor?: string
  /** Cor da tampa e do brilho. */
  accentColor?: string
  title?: string
}

export function BrandMark({
  className,
  bottleColor = 'var(--color-brand-600)',
  accentColor = 'var(--color-champagne-400)',
  title,
}: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      <rect x="12" y="2.5" width="8" height="5" rx="1.25" fill={accentColor} />
      <rect x="14" y="7.5" width="4" height="3" fill={bottleColor} />
      <rect x="6.5" y="10.5" width="19" height="19" rx="5.5" stroke={bottleColor} strokeWidth="2" />
      <path d={BRAND_SPARKLE_PATH} fill={accentColor} />
    </svg>
  )
}

interface LogoProps {
  className?: string
  /** Tamanho do texto/símbolo. */
  size?: 'sm' | 'md' | 'lg'
  /** Esconde o símbolo (só o nome). */
  wordmarkOnly?: boolean
}

const SIZES = {
  sm: { mark: 'h-7 w-7', text: 'text-xl' },
  md: { mark: 'h-8 w-8 sm:h-9 sm:w-9', text: 'text-2xl sm:text-[1.75rem]' },
  lg: { mark: 'h-11 w-11', text: 'text-4xl' },
} as const

export default function Logo({ className = '', size = 'md', wordmarkOnly = false }: LogoProps) {
  const s = SIZES[size]
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {!wordmarkOnly && <BrandMark className={`${s.mark} shrink-0`} />}
      <span
        className={`font-display font-semibold leading-none tracking-tight text-brand-700 ${s.text}`}
      >
        Bella
        <span className="px-[0.06em] font-medium italic text-champagne-500">&amp;</span>
        Cheirosa
      </span>
    </span>
  )
}
