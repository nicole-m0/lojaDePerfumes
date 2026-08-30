import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardCounts } from '@/server/catalog'
import { getDashboardMetrics } from '@/server/dashboard'
import { resolvePeriodPreset, periodLabel } from '@/lib/date-range'
import { formatCents } from '@/lib/format'
import DashboardPeriodFilter from '@/components/admin/DashboardPeriodFilter'
import SimpleBarChart from '@/components/admin/SimpleBarChart'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'
import { isLowStock } from '@/lib/stock'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dashboard' }

const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Site', WHATSAPP: 'WhatsApp' }
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  BOLETO: 'Boleto',
  CASH: 'Dinheiro',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
}

const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const shortDay = (isoDay: string) => dayFmt.format(new Date(`${isoDay}T00:00:00`))

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const { range: rangeParam } = await searchParams
  const preset = resolvePeriodPreset(rangeParam)

  const [counts, metrics] = await Promise.all([
    getDashboardCounts().catch(() => null),
    getDashboardMetrics(preset).catch(() => null),
  ])

  const n = (v: number | undefined) => (counts ? v : '—')
  const label = periodLabel(preset).toLowerCase()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {counts === null
              ? 'Banco indisponível — verifique DATABASE_URL.'
              : 'Visão geral do catálogo e dos pedidos.'}
          </p>
        </div>
        <DashboardPeriodFilter active={preset} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Produtos ativos</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.activeProducts)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/produtos" className="hover:text-foreground">
              Gerenciar produtos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Categorias</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.categories)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/categorias" className="hover:text-foreground">
              Categorias &amp; Marcas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Marcas</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.brands)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/categorias" className="hover:text-foreground">
              Categorias &amp; Marcas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pedidos (total)</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.orders)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/pedidos" className="hover:text-foreground">
              Ver pedidos
            </Link>
          </CardContent>
        </Card>
      </div>

      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Pedidos ({label})</CardDescription>
                <CardTitle className="text-3xl">{metrics.orders.total}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metrics.orders.canceled} cancelado(s) ·{' '}
                {(metrics.orders.canceledRate * 100).toFixed(0)}%
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Faturamento recebido ({label})</CardDescription>
                <CardTitle className="text-3xl">{formatCents(metrics.revenue.paidTotalCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metrics.revenue.paidOrderCount} pedido(s) pago(s) no período
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Ticket médio ({label})</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCents(metrics.revenue.averageTicketCents)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Calculado só sobre pedidos pagos
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>A receber ({label})</CardDescription>
                <CardTitle className="text-3xl">{formatCents(metrics.revenue.pendingTotalCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Pedidos com pagamento pendente ou parcial
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Pedidos por dia ({label})</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarChart
                  data={metrics.daily.map((d) => ({ label: shortDay(d.date), value: d.orders }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Faturamento recebido por dia ({label})</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarChart
                  data={metrics.daily.map((d) => ({
                    label: shortDay(d.date),
                    value: d.paidRevenueCents,
                  }))}
                  formatValue={formatCents}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Pedidos por status ({label})</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.orders.byStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem pedidos no período.</p>
                ) : (
                  <ul className="space-y-2">
                    {metrics.orders.byStatus.map((s) => (
                      <li key={s.key} className="flex items-center justify-between text-sm">
                        <OrderStatusBadge kind="order" value={s.key} />
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {metrics.orders.bySource.length > 0 && (
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    Origem:{' '}
                    {metrics.orders.bySource
                      .map((s) => `${SOURCE_LABEL[s.key] ?? s.key} (${s.count})`)
                      .join(' · ')}
                  </p>
                )}
                {metrics.revenue.byMethod.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pago via:{' '}
                    {metrics.revenue.byMethod
                      .map((m) => `${PAYMENT_METHOD_LABEL[m.method] ?? m.method} (${m.count})`)
                      .join(' · ')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Estoque baixo</CardDescription>
                <CardTitle className="text-3xl">
                  {metrics.stock.lowStockCount}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}
                    / {metrics.stock.totalProducts} produtos
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.stock.lowStockSample.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum produto com estoque baixo.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {metrics.stock.lowStockSample.map((p) => (
                      <li key={p.id} className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        <span
                          className={
                            isLowStock(p.stockOnHand)
                              ? 'font-semibold text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {p.stockOnHand}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/admin/estoque"
                  className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground"
                >
                  Ver estoque completo
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
