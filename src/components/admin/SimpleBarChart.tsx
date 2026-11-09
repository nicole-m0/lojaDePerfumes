// Gráfico de barras em SVG nativo — sem biblioteca de gráficos.
// `viewBox` fixo + `preserveAspectRatio="none"` permite escalar via CSS (w-full) sem JS de layout.

interface BarChartDatum {
  label: string
  value: number
}

interface SimpleBarChartProps {
  data: BarChartDatum[]
  formatValue?: (value: number) => string
  emptyMessage?: string
}

const VIEWBOX_WIDTH = 100
const VIEWBOX_HEIGHT = 40
const BAR_GAP_RATIO = 0.15

export default function SimpleBarChart({
  data,
  formatValue = (v) => String(v),
  emptyMessage = 'Sem dados no período.',
}: SimpleBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const max = Math.max(1, ...data.map((d) => d.value))
  const slotWidth = VIEWBOX_WIDTH / data.length
  const barWidth = slotWidth * (1 - BAR_GAP_RATIO)

  return (
    <div>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label="Gráfico de barras por dia"
      >
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (VIEWBOX_HEIGHT - 2)
          const x = i * slotWidth + (slotWidth - barWidth) / 2
          return (
            <rect
              key={d.label}
              x={x}
              y={VIEWBOX_HEIGHT - barHeight}
              width={barWidth}
              height={Math.max(barHeight, d.value > 0 ? 0.5 : 0)}
              className="fill-primary"
            >
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0].label}</span>
        {data.length > 1 && <span>{data[data.length - 1].label}</span>}
      </div>
    </div>
  )
}
