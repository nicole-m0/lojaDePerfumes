import 'server-only'
import { prisma } from '@/lib/prisma'
import { mapMercadoPagoMethod, mapMercadoPagoStatus } from '@/lib/payment-status'
import {
  applyGatewayPaymentUpdate,
  type GatewayApplyOutcome,
} from '@/server/payments'
import type {
  GatewayConfirmationOutcome,
  GatewayConfirmationResult,
} from '@/server/order-transitions'
import { whatsAppTemplateForStatus } from '@/lib/order-status'
import { sendOrderWhatsAppNotification } from '@/server/whatsapp'
import {
  getMercadoPagoPayment,
  MERCADO_PAGO_PROVIDER,
  searchMercadoPagoPaymentsByOrder,
  type MercadoPagoPayment,
} from '@/lib/mercadopago'

// ---------------------------------------------------------------------------
// Orquestração Mercado Pago — cola entre o gateway e o serviço central de
// pagamentos. NÃO decide estado: valida o vínculo com o pedido e o valor, e
// delega para `applyGatewayPaymentUpdate` (src/server/payments.ts).
//
// Usado por:
//  - webhook  (src/app/api/webhooks/mercadopago/route.ts) — após validar assinatura
//  - reconsulta administrativa (pedidos/[id]/actions.ts) — quando o webhook não chegou
//
// Regra fechada da Fase 4: nunca confiar cegamente no payload — o pagamento é
// SEMPRE consultado na API do Mercado Pago antes de qualquer efeito.
// ---------------------------------------------------------------------------

export type ProcessOutcome =
  | GatewayApplyOutcome // 'applied' | 'noop' | 'owner_action_required' | 'conflict'
  | 'ignored' // notificação que não é de pagamento
  | 'payment_not_found' // a API do Mercado Pago não conhece esse id
  | 'order_not_found' // external_reference não bate com nenhum pedido
  | 'amount_mismatch' // valor/moeda divergente — nada é alterado

export interface ProcessResult {
  outcome: ProcessOutcome
  orderId?: string
  paymentStatus?: string
  /**
   * Confirmação automática do pedido (Etapa D2), quando este pagamento aprovado o
   * levou a PAID. Só o resultado — sem dados do cliente (vai na resposta do webhook).
   */
  orderConfirmation?: GatewayConfirmationOutcome
  /** `true` quando a API informou um pagamento de PRODUÇÃO (live_mode) — só registro. */
  liveMode?: true
}

/**
 * Aviso de pedido confirmado, chamado DEPOIS do commit. Best-effort: falha aqui
 * nunca desfaz nem derruba a confirmação.
 */
export type NotifyOrderConfirmed = (input: {
  orderId: string
  confirmation: GatewayConfirmationResult
}) => Promise<void>

/** Código de idioma do template na Meta — o mesmo usado pelas actions de pedido. */
const WHATSAPP_LANGUAGE_CODE = 'pt_BR'

const notifyOrderConfirmedByWhatsApp: NotifyOrderConfirmed = async ({ orderId, confirmation }) => {
  const templateName = whatsAppTemplateForStatus('CONFIRMED')
  if (!templateName) return
  await sendOrderWhatsAppNotification({
    orderId,
    phone: confirmation.customerPhone,
    templateName,
    languageCode: WHATSAPP_LANGUAGE_CODE,
    bodyParams: [String(confirmation.number)],
  })
}

export interface WebhookDeps {
  fetchPayment: (id: string) => Promise<MercadoPagoPayment | null>
  notifyOrderConfirmed?: NotifyOrderConfirmed
}

const defaultWebhookDeps: WebhookDeps = { fetchPayment: getMercadoPagoPayment }

/**
 * Processa UMA notificação do webhook (`type` + `data.id`). A assinatura já foi
 * validada pelo route. Consulta o pagamento na API, valida pedido + valor e delega.
 */
export async function processMercadoPagoNotification(
  input: { type: string | null; dataId: string | null },
  deps: WebhookDeps = defaultWebhookDeps,
): Promise<ProcessResult> {
  if (input.type !== 'payment' || !input.dataId) {
    return { outcome: 'ignored' }
  }

  const mp = await deps.fetchPayment(input.dataId)
  if (!mp) return { outcome: 'payment_not_found' }

  return applyMercadoPagoPayment(mp, deps.notifyOrderConfirmed ?? notifyOrderConfirmedByWhatsApp)
}

/** Núcleo compartilhado: valida vínculo/valor de um pagamento do MP e aplica. */
async function applyMercadoPagoPayment(
  mp: MercadoPagoPayment,
  notifyOrderConfirmed: NotifyOrderConfirmed,
): Promise<ProcessResult> {
  // live_mode (Etapa D3): apenas registrado, nunca bloqueia. Bloquear pagamentos de
  // produção exige antes confirmar no sandbox (D4) qual valor os pagamentos de teste
  // trazem — um bloqueio errado barraria notificações legítimas. Log sem dados do cliente.
  const liveMode = mp.liveMode === true
  if (liveMode) {
    console.warn(
      `[mercadopago] pagamento ${mp.id} veio com live_mode=true (produção) ` +
        `para o pedido ${mp.externalReference ?? '?'}.`,
    )
  }
  const withLiveMode = (r: ProcessResult): ProcessResult => (liveMode ? { ...r, liveMode: true } : r)

  if (!mp.externalReference) return withLiveMode({ outcome: 'order_not_found' })

  const order = await prisma.order.findUnique({
    where: { id: mp.externalReference },
    select: { id: true, totalCents: true, currency: true },
  })
  if (!order) return withLiveMode({ outcome: 'order_not_found' })

  // Valor e moeda: o Mercado Pago devolve `transaction_amount` em reais.
  const mpCents = Math.round(mp.transactionAmount * 100)
  const currencyOk = (mp.currencyId || 'BRL') === (order.currency || 'BRL')
  if (mpCents !== order.totalCents || !currencyOk) {
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'NOTE',
        note:
          `Mercado Pago: pagamento ${mp.id} REJEITADO por divergência ` +
          `(MP ${mpCents}c/${mp.currencyId} × pedido ${order.totalCents}c/${order.currency}).`,
        userId: null,
      },
    })
    return withLiveMode({ outcome: 'amount_mismatch', orderId: order.id })
  }

  const result = await applyGatewayPaymentUpdate({
    orderId: order.id,
    provider: MERCADO_PAGO_PROVIDER,
    providerPaymentId: mp.id,
    rawStatus: mp.status,
    mappedStatus: mapMercadoPagoStatus(mp.status),
    amountCents: order.totalCents,
    method: mapMercadoPagoMethod(mp.paymentTypeId, mp.paymentMethodId),
  })

  // A transação já foi confirmada (commit) quando chegamos aqui. O aviso é
  // best-effort: um erro nele é só registrado, nunca muda o resultado.
  const confirmation = result.orderConfirmation
  if (confirmation?.outcome === 'confirmed') {
    try {
      await notifyOrderConfirmed({ orderId: order.id, confirmation })
    } catch (err) {
      console.error('[mercadopago] aviso de pedido confirmado falhou', err)
    }
  }

  return withLiveMode({
    outcome: result.outcome,
    orderId: order.id,
    paymentStatus: result.paymentStatus,
    ...(confirmation ? { orderConfirmation: confirmation.outcome } : {}),
  })
}

// --- Reconsulta administrativa ------------------------------------------

export interface ReconcileDeps {
  searchPayments: (orderId: string) => Promise<MercadoPagoPayment[]>
  notifyOrderConfirmed?: NotifyOrderConfirmed
}

const defaultReconcileDeps: ReconcileDeps = {
  searchPayments: searchMercadoPagoPaymentsByOrder,
}

export interface ReconcileResult {
  found: number
  results: ProcessResult[]
}

/**
 * Reconsulta todos os pagamentos do Mercado Pago vinculados a um pedido (por
 * `external_reference = Order.id`) e reaplica cada um pelo mesmo fluxo central.
 * Idempotente — reexecutar não duplica efeito. Respeita o gate OWNER: estornos /
 * chargebacks continuam exigindo ação manual do OWNER (aqui só ficam sinalizados).
 */
export async function reconcileOrderWithMercadoPago(
  orderId: string,
  deps: ReconcileDeps = defaultReconcileDeps,
): Promise<ReconcileResult> {
  const payments = await deps.searchPayments(orderId)
  const results: ProcessResult[] = []
  // A busca vem do mais novo para o mais antigo; aplica na ordem cronológica.
  for (const mp of [...payments].reverse()) {
    results.push(
      await applyMercadoPagoPayment(mp, deps.notifyOrderConfirmed ?? notifyOrderConfirmedByWhatsApp),
    )
  }
  return { found: payments.length, results }
}
