import { Minus, Plus } from 'lucide-react'

// Seletor de quantidade retangular (sacola e gaveta). Só apresentação: quem usa
// decide os limites (estoque) e o que acontece ao mudar.
export default function QuantityStepper({
  value,
  onDecrease,
  onIncrease,
  canIncrease = true,
  label,
}: {
  value: number
  onDecrease: () => void
  onIncrease: () => void
  canIncrease?: boolean
  /** Nome do produto, para os rótulos acessíveis. */
  label: string
}) {
  return (
    <div className="inline-flex items-center border border-ink/20">
      <button
        type="button"
        onClick={onDecrease}
        aria-label={value <= 1 ? `Remover ${label}` : `Diminuir quantidade de ${label}`}
        className="flex h-8 w-8 items-center justify-center text-ink transition-colors hover:bg-sand-100"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span
        className="w-7 text-center text-sm font-medium tabular-nums text-ink"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        aria-label={`Aumentar quantidade de ${label}`}
        className="flex h-8 w-8 items-center justify-center text-ink transition-colors hover:bg-sand-100 disabled:cursor-not-allowed disabled:text-ink/30 disabled:hover:bg-transparent"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}
