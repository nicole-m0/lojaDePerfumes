import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getAdminOrder } from '@/server/orders'
import { requireStaff } from '@/server/guard'
import { isMercadoPagoConfigured } from '@/lib/mercadopago'
import { formatCents } from '@/lib/format'
import type { OrderStatusValue } from '@/lib/order-status'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'
import OrderStatusControl from '@/components/admin/OrderStatusControl'
import PaymentControl from '@/components/admin/PaymentControl'
import ShipmentForm from '@/components/admin/ShipmentForm'
import OrderNoteForm from '@/components/admin/OrderNoteForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Pedido' }

interface PageProps {
  params: Promise<{ id: string }>
}

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: 'Site',
  WHATSAPP: 'WhatsApp',
}

const EVENT_LABEL: Record<string, string> = {
  ORDER_STATUS_CHANGED: 'Status do pedido',
  PAYMENT_STATUS_CHANGED: 'Pagamento',
  NOTE: 'Nota',
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const fmtDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : '—')

export default async function OrderDetailPage({ params }: PageProps) {
  const { id } = await params
  const [order, staff] = await Promise.all([getAdminOrder(id), requireStaff()])
  if (!order) notFound()
  const canReverse = staff.role === 'OWNER'
  const mercadoPagoEnabled = isMercadoPagoConfigured()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Pedidos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Pedido #{order.number}</h1>
          <Badge variant="outline">{SOURCE_LABEL[order.source] ?? order.source}</Badge>
          <OrderStatusBadge kind="order" value={order.status} />
          <OrderStatusBadge kind="payment" value={order.paymentStatus} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Criado em {fmtDate(order.createdAt)} · atualizado em {fmtDate(order.updatedAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status do pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusControl orderId={order.id} status={order.status as OrderStatusValue} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{order.customerName}</div>
            <div className="text-muted-foreground">{order.customerEmail ?? '—'}</div>
            <div className="text-muted-foreground">{order.customerPhone ?? '—'}</div>
            {order.customer && (
              <div className="pt-1 text-xs text-muted-foreground">
                Cadastro vinculado: {order.customer.name}
                {order.customer.document ? ` · ${order.customer.document}` : ''}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço de entrega</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {order.address ? (
              <address className="not-italic">
                {order.address.recipientName}
                <br />
                {order.address.street}, {order.address.number}
                {order.address.complement ? ` — ${order.address.complement}` : ''}
                <br />
                {order.address.neighborhood} · {order.address.city}/{order.address.state}
                <br />
                CEP {order.address.zipCode}
                {order.address.reference ? (
                  <>
                    <br />
                    Ref.: {order.address.reference}
                  </>
                ) : null}
                {order.address.phone ? (
                  <>
                    <br />
                    Tel.: {order.address.phone}
                  </>
                ) : null}
              </address>
            ) : (
              'Sem endereço registrado.'
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto (na compra)</TableHead>
                <TableHead className="text-right">Preço unit.</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Sem itens.
                  </TableCell>
                </TableRow>
              )}
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.productName}
                    <span className="block text-xs text-muted-foreground">{item.productSlug}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(item.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(item.discountCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(item.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="tabular-nums">-{formatCents(order.discountCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Frete</dt>
              <dd className="tabular-nums">{formatCents(order.shippingCents)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentControl
              orderId={order.id}
              orderTotalCents={order.totalCents}
              canReverse={canReverse}
              mercadoPagoEnabled={mercadoPagoEnabled}
              payments={order.payments.map((p) => ({
                id: p.id,
                method: p.method,
                amountCents: p.amountCents,
                status: p.status,
                paidAt: p.paidAt,
                createdAt: p.createdAt,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrega</CardTitle>
          </CardHeader>
          <CardContent>
            <ShipmentForm orderId={order.id} shipment={order.shipment} />
          </CardContent>
        </Card>
      </div>

      {order.invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas fiscais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {order.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2">
                <span>
                  {inv.number ? `NF ${inv.series ?? ''}/${inv.number}` : 'NF (sem número)'} ·{' '}
                  {fmtDate(inv.issuedAt)}
                </span>
                <OrderStatusBadge kind="invoice" value={inv.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <OrderNoteForm orderId={order.id} />

          <div className="space-y-2 border-t pt-3 text-sm">
            {order.events.length === 0 && (
              <p className="text-muted-foreground">Sem eventos registrados.</p>
            )}
            {order.events.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="tabular-nums text-xs text-muted-foreground">
                  {fmtDate(ev.createdAt)}
                </span>
                <Badge variant="outline">{EVENT_LABEL[ev.type] ?? ev.type}</Badge>
                {(ev.fromStatus || ev.toStatus) && (
                  <span className="text-muted-foreground">
                    {ev.fromStatus ?? '—'} → {ev.toStatus ?? '—'}
                  </span>
                )}
                {ev.note && <span>· {ev.note}</span>}
                <span className="text-xs text-muted-foreground">
                  · {ev.user?.name ?? ev.user?.email ?? 'sistema'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
