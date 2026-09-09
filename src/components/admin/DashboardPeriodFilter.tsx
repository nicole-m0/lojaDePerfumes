import Link from 'next/link'
import { PERIOD_PRESETS, periodLabel, type PeriodPreset } from '@/lib/date-range'
import { cn } from '@/lib/utils'

// Presets fixos via URL (?range=...) — sem seletor de data customizado nesta fase.
// `basePath` default mantém o uso original (Dashboard, `/admin`); a Fase 6 reaproveita
// o mesmo componente em `/admin/financeiro` passando basePath="/admin/financeiro".
export default function DashboardPeriodFilter({
  active,
  basePath = '/admin',
}: {
  active: PeriodPreset
  basePath?: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERIOD_PRESETS.map((preset) => (
        <Link
          key={preset}
          href={`${basePath}?range=${preset}`}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            preset === active
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-foreground hover:bg-accent',
          )}
        >
          {periodLabel(preset)}
        </Link>
      ))}
    </div>
  )
}
