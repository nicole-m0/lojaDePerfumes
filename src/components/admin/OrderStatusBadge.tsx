import { Badge } from '@/components/ui/badge'

// Badge reutilizável para status de pedido / pagamento / entrega / nota fiscal.
// Apenas exibição — nenhuma ação de mudança de status nesta fase.

type Variant = 'default' | 'secondary' | 'outline' | 'destructive'
type Entry = { label: string; variant: Variant }

const ORDER: Record<string, Entry> = {
  DRAFT: { label: 'Rascunho', variant: 'outline' },
  PENDING: { label: 'Pendente', variant: 'secondary' },
  CONFIRMED: { label: 'Confirmado', variant: 'default' },
  PROCESSING: { label: 'Em preparação', variant: 'default' },
  SHIPPED: { label: 'Enviado', variant: 'default' },
  DELIVERED: { label: 'Entregue', variant: 'default' },
  CANCELED: { label: 'Cancelado', variant: 'destructive' },
}

const PAYMENT: Record<string, Entry> = {
  PENDING: { label: 'Pagamento pendente', variant: 'secondary' },
  PAID: { label: 'Pago', variant: 'default' },
  PARTIALLY_PAID: { label: 'Parcialmente pago', variant: 'secondary' },
  REFUNDED: { label: 'Estornado', variant: 'outline' },
  CHARGEBACK: { label: 'Chargeback', variant: 'destructive' },
  FAILED: { label: 'Falhou', variant: 'destructive' },
  CANCELED: { label: 'Cancelado', variant: 'outline' },
}

const SHIPMENT: Record<string, Entry> = {
  PENDING: { label: 'Aguardando', variant: 'secondary' },
  READY: { label: 'Pronto p/ envio', variant: 'default' },
  IN_TRANSIT: { label: 'Em trânsito', variant: 'default' },
  DELIVERED: { label: 'Entregue', variant: 'default' },
  RETURNED: { label: 'Devolvido', variant: 'outline' },
  CANCELED: { label: 'Cancelado', variant: 'destructive' },
}

const INVOICE: Record<string, Entry> = {
  PENDING: { label: 'Pendente', variant: 'secondary' },
  PROCESSING: { label: 'Processando', variant: 'secondary' },
  AUTHORIZED: { label: 'Autorizada', variant: 'default' },
  REJECTED: { label: 'Rejeitada', variant: 'destructive' },
  CANCELED: { label: 'Cancelada', variant: 'outline' },
  ERROR: { label: 'Erro', variant: 'destructive' },
}

const MAPS = { order: ORDER, payment: PAYMENT, shipment: SHIPMENT, invoice: INVOICE }

export default function OrderStatusBadge({
  kind,
  value,
}: {
  kind: keyof typeof MAPS
  value: string
}) {
  const entry = MAPS[kind][value] ?? { label: value, variant: 'outline' as Variant }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}
