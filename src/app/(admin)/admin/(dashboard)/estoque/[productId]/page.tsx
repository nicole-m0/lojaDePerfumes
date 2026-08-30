import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getProductForStock, listStockMovements } from '@/server/stock'
import { isLowStock } from '@/lib/stock'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  StockAdjustmentForm,
  StockEntryForm,
  StockExitForm,
} from '@/components/admin/StockMovementForms'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Movimentação de estoque' }

interface PageProps {
  params: Promise<{ productId: string }>
}

const TYPE_LABEL: Record<string, string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolução',
}

const REASON_LABEL: Record<string, string> = {
  PURCHASE: 'Compra/reposição',
  SALE: 'Venda',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  CUSTOMER_RETURN: 'Devolução de cliente',
  LOSS: 'Perda/quebra',
  INVENTORY_COUNT: 'Contagem de inventário',
  OTHER: 'Outro',
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default async function ProductStockPage({ params }: PageProps) {
  const { productId } = await params
  const [product, movements] = await Promise.all([
    getProductForStock(productId),
    listStockMovements(productId),
  ])
  if (!product) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/estoque"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Estoque
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {isLowStock(product.stockOnHand) && <Badge variant="destructive">Estoque baixo</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Saldo atual: <span className="font-medium text-foreground">{product.stockOnHand} un.</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrada</CardTitle>
          </CardHeader>
          <CardContent>
            <StockEntryForm productId={product.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saída</CardTitle>
          </CardHeader>
          <CardContent>
            <StockExitForm productId={product.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajuste (contagem)</CardTitle>
          </CardHeader>
          <CardContent>
            <StockAdjustmentForm productId={product.id} currentStock={product.stockOnHand} />
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Histórico de movimentações</h2>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nenhuma movimentação registrada ainda.
                  </TableCell>
                </TableRow>
              )}
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {dateFmt.format(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.type === 'OUTBOUND' ? 'destructive' : 'default'}>
                      {TYPE_LABEL[m.type] ?? m.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {REASON_LABEL[m.reason] ?? m.reason}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.quantity}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.order ? (
                      <Link href={`/admin/pedidos/${m.orderId}`} className="hover:text-foreground">
                        #{m.order.number}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.user?.name ?? m.user?.email ?? 'Sistema'}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground" title={m.note ?? ''}>
                    {m.note ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
