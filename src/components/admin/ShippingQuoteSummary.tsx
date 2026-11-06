import { formatCents } from '@/lib/format'
import {
  DEMO_SHIPPING_ADMIN_NOTICE,
  formatDeliveryWindow,
  isDemoShippingProvider,
} from '@/lib/shipping/demo'
import { Badge } from '@/components/ui/badge'

// Resumo do frete escolhido no checkout (snapshot `ShippingQuote`), na página do
// pedido no painel. Sem estado nem hooks. Quando `provider = "demo"` a simulação
// é destacada: selo, aviso e "(fictício)" no valor e no prazo.

export interface ShippingQuoteSummaryValue {
  provider: string
  serviceName: string
  carrier: string
  priceCents: number
  deliveryDaysMin: number | null
  deliveryDaysMax: number | null
  quotedAt: Date
  originZip: string
  destZip: string
}

export default function ShippingQuoteSummary({
  quote,
  formatDate,
}: {
  quote: ShippingQuoteSummaryValue
  formatDate: (d: Date) => string
}) {
  const simulated = isDemoShippingProvider(quote.provider)
  const window = formatDeliveryWindow(quote.deliveryDaysMin, quote.deliveryDaysMax)
  const fictitious = simulated ? ' (fictício)' : ''

  return (
    <dl className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        Frete escolhido no checkout (snapshot — não muda ao atualizar a entrega)
        {simulated && <Badge variant="outline">Frete simulado</Badge>}
      </div>
      {simulated && (
        <p className="mb-2 border-l-2 border-amber-500 bg-amber-50 px-2 py-1 text-xs text-amber-900" role="note">
          {DEMO_SHIPPING_ADMIN_NOTICE}
        </p>
      )}
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Serviço</dt>
        <dd>
          {simulated ? '' : quote.carrier ? `${quote.carrier} · ` : ''}
          {quote.serviceName}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="tabular-nums">
          {formatCents(quote.priceCents)}
          {fictitious}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Prazo estimado</dt>
        <dd>{window ? `${window}${fictitious}` : '—'}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Cotado em</dt>
        <dd>{formatDate(quote.quotedAt)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">CEP origem → destino</dt>
        <dd className="tabular-nums">
          {quote.originZip || '—'} → {quote.destZip}
        </dd>
      </div>
    </dl>
  )
}
