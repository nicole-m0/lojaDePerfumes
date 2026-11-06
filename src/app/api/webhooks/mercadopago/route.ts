import { NextResponse } from 'next/server'
import { isValidMercadoPagoPaymentId, verifyWebhookSignature } from '@/lib/mercadopago'
import { processMercadoPagoNotification } from '@/server/mercadopago'

// Webhook do Mercado Pago (Checkout Pro — Fase 4; endurecido na Etapa D3).
//
// 1. Corpo limitado a MAX_BODY_BYTES; JSON inválido vale como corpo vazio.
// 2. Tópicos que não são de pagamento (ex.: merchant_order) são ignorados com 200:
//    nada é consultado nem gravado, e o Mercado Pago não fica reenviando.
// 3. `data.id` precisa ser só dígitos (1 a 20) — senão 400, sem tocar na API.
// 4. Valida a assinatura (`x-signature` + `x-request-id` + MERCADOPAGO_WEBHOOK_SECRET,
//    HMAC-SHA256 comparado em tempo constante) — senão 401.
// 5. NÃO confia no corpo: usa só o id e consulta o pagamento na API do Mercado Pago.
// 6. Delega para `processMercadoPagoNotification`, que valida pedido + valor e passa
//    pelo serviço central de pagamentos (idempotente; confirmação automática da D2).
//
// Runtime Node (crypto/HMAC). Sem cache.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Notificações reais têm poucas centenas de bytes; 64 KiB é folga ampla. */
const MAX_BODY_BYTES = 64 * 1024

function getDataId(url: URL, body: unknown): string | null {
  // O Mercado Pago assina o `data.id` da query. Se o parâmetro existe na URL (mesmo
  // vazio), é ele que vale — não cai para o corpo, que não é o valor assinado.
  for (const key of ['data.id', 'id']) {
    if (url.searchParams.has(key)) return url.searchParams.get(key)
  }
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

type BodyResult =
  | { ok: true; body: unknown }
  | {
      ok: false
      status: 400 | 413
      error: 'invalid_content_length' | 'body_read_error' | 'payload_too_large'
    }

const TOO_LARGE = { ok: false, status: 413, error: 'payload_too_large' } as const

/**
 * Lê o corpo sem nunca guardar mais que MAX_BODY_BYTES na memória:
 * - `Content-Length`, se informado, precisa ser um inteiro não negativo (senão 400)
 *   e acima do limite já recusa sem ler nada (413);
 * - a leitura é feita em blocos, somando os bytes; ao passar do limite o stream é
 *   cancelado na hora (413) — vale também sem `Content-Length` ou com valor falso.
 * - erro durante a leitura (ex.: conexão interrompida no meio do envio) → 400: um
 *   corpo recebido pela metade nunca segue para o processamento.
 * JSON inválido ou corpo realmente vazio continuam valendo como `null`.
 */
async function readBody(request: Request): Promise<BodyResult> {
  const header = request.headers.get('content-length')
  if (header !== null) {
    if (!/^\d+$/.test(header.trim())) {
      return { ok: false, status: 400, error: 'invalid_content_length' }
    }
    if (Number(header.trim()) > MAX_BODY_BYTES) return TOO_LARGE
  }

  if (!request.body) return { ok: true, body: null }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        return TOO_LARGE
      }
      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => {})
    return { ok: false, status: 400, error: 'body_read_error' }
  } finally {
    reader.releaseLock()
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks))
  if (!text) return { ok: true, body: null }
  try {
    return { ok: true, body: JSON.parse(text) }
  } catch {
    return { ok: true, body: null }
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)

  const read = await readBody(request)
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: read.status })
  }
  const body = read.body

  const type = getType(url, body)
  if (type !== 'payment') {
    return NextResponse.json({ outcome: 'ignored' }, { status: 200 })
  }

  const dataId = getDataId(url, body)
  if (!isValidMercadoPagoPaymentId(dataId)) {
    return NextResponse.json({ error: 'invalid_data_id' }, { status: 400 })
  }

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
