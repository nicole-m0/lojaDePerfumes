import { NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/mercadopago'
import { processMercadoPagoNotification } from '@/server/mercadopago'

// Webhook do Mercado Pago (Checkout Pro — Fase 4).
//
// 1. Valida a assinatura (`x-signature` + `x-request-id` + MERCADOPAGO_WEBHOOK_SECRET).
// 2. NÃO confia no corpo: extrai só o id do pagamento e consulta a API do Mercado Pago.
// 3. Delega para `processMercadoPagoNotification`, que valida pedido + valor e passa
//    pelo serviço central de pagamentos (idempotente; REFUNDED/CHARGEBACK só sinalizam
//    — aplicação exige OWNER).
//
// Runtime Node (crypto/HMAC). Sem cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getDataId(url: URL, body: unknown): string | null {
  const fromQuery = url.searchParams.get('data.id') ?? url.searchParams.get('id')
  if (fromQuery) return fromQuery
  const b = body as { data?: { id?: unknown }; id?: unknown } | null
  const raw = b?.data?.id ?? b?.id
  return raw == null ? null : String(raw)
}

function getType(url: URL, body: unknown): string | null {
  const fromQuery = url.searchParams.get('type') ?? url.searchParams.get('topic')
  if (fromQuery) return fromQuery
  const b = body as { type?: unknown; topic?: unknown } | null
  const raw = b?.type ?? b?.topic
  return raw == null ? null : String(raw)
}

export async function POST(request: Request) {
  const url = new URL(request.url)

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  const dataId = getDataId(url, body)
  const type = getType(url, body)

  const signatureOk = verifyWebhookSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  })
  if (!signatureOk) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  try {
    const result = await processMercadoPagoNotification({ type, dataId })

    // payment_not_found / order_not_found podem ser transitórios → 404 para o Mercado
    // Pago reenviar. Os demais são definitivos (já registrados) → 200.
    const retryable =
      result.outcome === 'payment_not_found' || result.outcome === 'order_not_found'
    return NextResponse.json(result, { status: retryable ? 404 : 200 })
  } catch (err) {
    console.error('[webhook mercadopago]', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
