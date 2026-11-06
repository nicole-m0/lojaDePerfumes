// Presets de período do dashboard — função pura e testável.
// `now` é parâmetro (não `new Date()` direto) para permitir teste determinístico.

export type PeriodPreset = 'today' | '7d' | '30d' | 'month'

export const PERIOD_PRESETS: PeriodPreset[] = ['today', '7d', '30d', 'month']

export const DEFAULT_PERIOD_PRESET: PeriodPreset = '7d'

const PERIOD_LABEL: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  month: 'Este mês',
}

export function periodLabel(preset: PeriodPreset): string {
  return PERIOD_LABEL[preset]
}

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === 'string' && (PERIOD_PRESETS as string[]).includes(value)
}

export function resolvePeriodPreset(value: unknown): PeriodPreset {
  return isPeriodPreset(value) ? value : DEFAULT_PERIOD_PRESET
}

export interface DateRange {
  from: Date
  to: Date
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Resolve um preset em um intervalo [from, to] concreto, ambos inclusivos. */
export function resolveDateRange(preset: PeriodPreset, now: Date = new Date()): DateRange {
  const to = now

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to }
    case '7d': {
      const from = startOfDay(now)
      from.setDate(from.getDate() - 6)
      return { from, to }
    }
    case '30d': {
      const from = startOfDay(now)
      from.setDate(from.getDate() - 29)
      return { from, to }
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to }
    default:
      return { from: startOfDay(now), to }
  }
}

/** Lista as datas (YYYY-MM-DD, dia a dia) cobertas pelo intervalo — para bucketizar séries diárias. */
export function enumerateDays(range: DateRange): string[] {
  const days: string[] = []
  const cursor = startOfDay(range.from)
  const last = startOfDay(range.to)
  while (cursor <= last) {
    days.push(toDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function toDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
