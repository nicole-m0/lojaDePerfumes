import Image from 'next/image'
import {
  SprayCan,
  Gift,
  Palette,
  Droplets,
  SoapDispenserDroplet,
  Handbag,
  Sun,
} from 'lucide-react'
import type { Product } from '../types'

const ICONS: Record<string, typeof SprayCan> = {
  perfume: SprayCan,
  gift: Gift,
  lipstick: Palette,
  lotion: Droplets,
  soap: SoapDispenserDroplet,
  bag: Handbag,
  sun: Sun,
  spray: SprayCan,
}

const DEFAULT_GRADIENT = 'from-venus-300 via-venus-200 to-venus-100'

interface ProductVisualProps {
  product: Product
  className?: string
  iconClassName?: string
}

export default function ProductVisual({
  product,
  className = '',
  iconClassName = '',
}: ProductVisualProps) {
  if (product.imageUrl) {
    return (
      <div className={`relative overflow-hidden bg-venus-50 ${className}`}>
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 300px"
          className="object-cover"
        />
      </div>
    )
  }

  const Icon = ICONS[product.icon ?? ''] ?? SprayCan
  const gradient = product.gradient ?? DEFAULT_GRADIENT

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${gradient} ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_55%)]" />
      <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-white/20 blur-xl" />
      <Icon className={`relative drop-shadow-sm text-white/90 ${iconClassName}`} strokeWidth={1.5} />
    </div>
  )
}
