import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getFinanceMetrics } from '@/server/finance'
import { listExpenses } from '@/server/expenses'
import { resolvePeriodPreset, periodLabel } from '@/lib/date-range'
import { formatCents } from '@/lib/format'
import DashboardPeriodFilter from '@/components/admin/DashboardPeriodFilter'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Financeiro' }

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

export default async function FinancePage({ searchParams }: PageProps) {
  const { range: rangeParam } = await searchParams
  const preset = resolvePeriodPreset(rangeParam)
  const label = periodLabel(preset).toLowerCase()

  const metrics = await getFinanceMetrics(preset).catch(() => null)
  const expenses = metrics ? await listExpenses(metrics.range).catch(() => []) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {metrics === null
              ? 'Banco indisponível — verifique DATABASE_URL.'
              : 'Receita recebida, estornos, despesas e custo dos produtos vendidos.'}
          </p>
        </div>
        <DashboardPeriodFilter active={preset} basePath="/admin/financeiro" />
      </div>

      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Receita recebida ({label})</CardDescription>
                <CardTitle className="text-3xl">{formatCents(metrics.receivedCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Dinheiro efetivamente recebido via pagamentos — não é o faturamento bruto dos
                pedidos.
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Estornos e chargebacks ({label})</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCents(metrics.refundedCents + metrics.chargebackCents)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {formatCents(metrics.refundedCents)} estornado ·{' '}
                {formatCents(metrics.chargebackCents)} em chargeback
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Despesas ({label})</CardDescription>
                <CardTitle className="text-3xl">{formatCents(metrics.expensesCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {expenses.length} lançamento(s) no período ·{' '}
                <Link href="/admin/financeiro/despesas/nova" className="underline">
                  nova despesa
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Custo dos produtos vendidos ({label})</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCents(metrics.cogs.knownCostCents)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metrics.cogs.hasUnknownCost
                  ? 'Considera só itens com custo cadastrado — há vendas com custo desconhecido (ver aviso abaixo).'
                  : 'Considera todos os itens vendidos em pedidos pagos no período.'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Margem bruta ({label})</CardDescription>
                <CardTitle className="text-3xl">
                  {metrics.grossMargin.available ? formatCents(metrics.grossMargin.marginCents) : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {metrics.grossMargin.available
                  ? `${(metrics.grossMargin.marginPercent! * 100).toFixed(1)}% sobre a receita com custo conhecido`
                  : 'Sem produtos vendidos com custo cadastrado no período — nada a calcular.'}
              </CardContent>
            </Card>
          </div>

          {metrics.cogs.hasUnknownCost && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">Há produtos vendidos sem custo cadastrado.</p>
              <p className="mt-1 text-xs">
                {formatCents(metrics.cogs.unknownCostRevenueCents)} em receita ({metrics.cogs.unknownCostQuantity}{' '}
                unidade(s)) vêm de produtos sem <code>custo</code> preenchido — essa parcela fica
                de fora do custo dos produtos vendidos e da margem bruta acima, para não inflar o
                resultado artificialmente. Preencha o custo em{' '}
                <Link href="/admin/produtos" className="underline">
                  Produtos
                </Link>{' '}
                para incluí-los.
              </p>
            </div>
          )}
        </>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Despesas ({label})</h2>
          <Button asChild size="sm">
            <Link href="/admin/financeiro/despesas/nova">
              <Plus className="size-4" />
              Nova despesa
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Nenhuma despesa registrada neste período.
                  </TableCell>
                </TableRow>
              )}
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground">{dateFmt.format(e.occurredAt)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/financeiro/despesas/${e.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {e.description}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(e.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
