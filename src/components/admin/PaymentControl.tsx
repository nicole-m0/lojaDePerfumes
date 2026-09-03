'use client'

import { useActionState } from 'react'
import {
  updatePaymentStatus,
  createPayment,
  reconsultMercadoPagoPayment,
  type OrderActionState,
} from '@/app/(admin)/admin/(dashboard)/pedidos/[id]/actions'
import {
  summarizePayments,
  nextStatuses,
  PAYMENT_STATUS_LABEL,
  type PaymentStatusValue,
} from '@/lib/payment-status'
import { formatCents } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import OrderStatusBadge from '@/components/admin/OrderStatusBadge'

const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'BANK_TRANSFER', label: 'Transferência' },
  { value: 'OTHER', label: 'Outro' },
]

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
)

const selectClass =
  'mt-1.5 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

// `timeZone` fixo: este é um componente client (renderiza no SSR e re-renderiza na
// hidratação). Sem fixar o fuso, o servidor formataria no fuso da máquina e o navegador
// no fuso do usuário — strings diferentes = hydration mismatch. A loja opera em BRT.
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export interface PaymentRowValue {
  id: string
  method: string
  amountCents: number
  status: string
  paidAt: Date | null
  createdAt: Date
}

const REVERSAL_STATUSES: PaymentStatusValue[] = ['REFUNDED', 'CHARGEBACK']

function PaymentRow({
  orderId,
  payment,
  canReverse,
}: {
  orderId: string
  payment: PaymentRowValue
  canReverse: boolean
}) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    updatePaymentStatus,
    {},
  )
  const allOptions = nextStatuses(payment.status as PaymentStatusValue)
  // Estorno/chargeback só aparecem para o OWNER (o servidor também barra — este é
  // apenas o reflexo na UI). Ver assertCanReverse em src/server/payments.ts.
  const options = canReverse
    ? allOptions
    : allOptions.filter((o) => !REVERSAL_STATUSES.includes(o))
  const isTerminal = allOptions.length === 0
  const ownerOnlyBlocked = !isTerminal && options.length === 0

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {METHOD_LABEL[payment.method] ?? payment.method} ·{' '}
          <span className="tabular-nums">{formatCents(payment.amountCents)}</span>
        </span>
        <OrderStatusBadge kind="payment" value={payment.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Registrado em {dateFmt.format(payment.createdAt)}
        {payment.paidAt ? ` · pago em ${dateFmt.format(payment.paidAt)}` : ''}
      </p>

      {isTerminal ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Status final — sem novas transições para este pagamento.
        </p>
      ) : ownerOnlyBlocked ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Somente o proprietário (OWNER) pode registrar estorno ou chargeback deste
          pagamento.
        </p>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="paymentId" value={payment.id} />
          <div>
            <Label htmlFor={`payment-status-${payment.id}`}>Novo status</Label>
            <select
              id={`payment-status-${payment.id}`}
              name="toStatus"
              defaultValue={options[0]}
              className={selectClass}
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {PAYMENT_STATUS_LABEL[o]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Atualizar pagamento'}
          </Button>
          {state.error && (
            <p className="text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function AddPaymentForm({
  orderId,
  availableToRegisterCents,
}: {
  orderId: string
  availableToRegisterCents: number
}) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    createPayment,
    {},
  )
  const closed = availableToRegisterCents <= 0

  return (
    <form action={formAction} className="space-y-3 border-t pt-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-payment-method">Método</Label>
          <select id="new-payment-method" name="method" defaultValue="PIX" className={selectClass}>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="new-payment-amount">Valor (R$)</Label>
          <Input
            id="new-payment-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            disabled={closed}
            className="mt-1.5"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="new-payment-notes">Observações</Label>
        <Textarea
          id="new-payment-notes"
          name="notes"
          rows={2}
          disabled={closed}
          className="mt-1.5"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Disponível para registrar:{' '}
        <span className="tabular-nums">{formatCents(availableToRegisterCents)}</span> (total do
        pedido menos o que já está pago ou pendente). Registro manual — nenhum pagamento é
        processado.
      </p>
      <Button type="submit" size="sm" disabled={isPending || closed}>
        {closed
          ? 'Sem saldo a registrar'
          : isPending
            ? 'Salvando...'
            : 'Registrar pagamento'}
      </Button>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}

function ReconsultMercadoPago({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState<OrderActionState, FormData>(
    reconsultMercadoPagoPayment,
    {},
  )
  return (
    <form action={formAction} className="space-y-2 border-t pt-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-xs text-muted-foreground">
        Sincroniza este pedido com o Mercado Pago (útil se a notificação automática não
        chegou). Não aplica estorno/chargeback — isso continua exigindo o OWNER.
      </p>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? 'Consultando...' : 'Reconsultar no Mercado Pago'}
      </Button>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-xs text-emerald-600">Pedido sincronizado.</p>}
    </form>
  )
}

export default function PaymentControl({
  orderId,
  orderTotalCents,
  payments,
  canReverse,
  mercadoPagoEnabled,
}: {
  orderId: string
  orderTotalCents: number
  payments: PaymentRowValue[]
  canReverse: boolean
  mercadoPagoEnabled: boolean
}) {
  const summary = summarizePayments(
    payments.map((p) => ({ status: p.status as PaymentStatusValue, amountCents: p.amountCents })),
    orderTotalCents,
  )

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3">
        <div>
          <dt className="text-xs text-muted-foreground">Total pago</dt>
          <dd className="tabular-nums font-medium">{formatCents(summary.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Saldo restante</dt>
          <dd className="tabular-nums font-medium">{formatCents(summary.remainingCents)}</dd>
        </div>
        {summary.pendingCents > 0 && (
          <div>
            <dt className="text-xs text-muted-foreground">Pendente de confirmação</dt>
            <dd className="tabular-nums font-medium">{formatCents(summary.pendingCents)}</dd>
          </div>
        )}
      </dl>
      {summary.status === 'PARTIALLY_PAID' && (
        <p className="text-xs text-amber-600">
          Pagamento parcial — ainda falta {formatCents(summary.remainingCents)}.
        </p>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <PaymentRow key={p.id} orderId={orderId} payment={p} canReverse={canReverse} />
          ))}
        </div>
      )}

      {mercadoPagoEnabled && <ReconsultMercadoPago orderId={orderId} />}

      <AddPaymentForm
        orderId={orderId}
        availableToRegisterCents={summary.availableToRegisterCents}
      />
    </div>
  )
}
