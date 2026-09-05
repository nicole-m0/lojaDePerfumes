import type { Metadata } from 'next'
import Link from 'next/link'
import { listAdminOrders } from '@/server/orders'
import { formatCents } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pedidos' }

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: 'Site',
  WHATSAPP: 'WhatsApp',
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default async function OrdersPage() {
  const orders = await listAdminOrders().catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          {orders.length} pedido(s). Visualização somente leitura.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhum pedido ainda. A criação de pedidos (site e WhatsApp) chega nas próximas
                  fases.
                </TableCell>
              </TableRow>
            )}
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:text-primary">
                    #{o.number}
                  </Link>
                </TableCell>
                <TableCell>{o.customerName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{SOURCE_LABEL[o.source] ?? o.source}</Badge>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge kind="order" value={o.status} />
                </TableCell>
                <TableCell>
                  <OrderStatusBadge kind="payment" value={o.paymentStatus} />
                </TableCell>
                <TableCell className="text-muted-foreground">{o._count.items}</TableCell>
                <TableCell>{formatCents(o.totalCents)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {dateFmt.format(o.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
