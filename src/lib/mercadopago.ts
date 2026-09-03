import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { centsToReais } from '@/lib/format'

// ---------------------------------------------------------------------------
// Cliente Mercado Pago — Checkout Pro (Fase 4).
//
// Sem SDK: chamadas REST diretas com `fetch`. O token de acesso e o segredo do
// webhook vêm SEMPRE de variáveis de ambiente, nunca do código. Esta fase é
// validada em sandbox/teste — as credenciais de teste do Mercado Pago fazem o
// `init_point` já apontar para o ambiente de teste.
//
// Nada aqui decide estado de pagamento: a tradução do status do gateway para o
// nosso domínio é `mapMercadoPagoStatus` (src/lib/payment-status.ts) e a
// aplicação passa por `applyGatewayPaymentUpdate` (src/server/payments.ts).
// ---------------------------------------------------------------------------

const MP_API = 'https://api.mercadopago.com'

export const MERCADO_PAGO_PROVIDER = 'mercadopago'

export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
}

/** URL pública do app — usada para back_urls e notification_url da preferência. */
export function getPublicBaseUrl(): string {
  const raw = process.env.AUTH_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado.')
  return token
}

// --- Preferência (Checkout Pro) -----------------------------------------

export interface PreferenceInput {
  orderId: string
  orderNumber: number
  totalCents: number
  currency: string
}

export interface MercadoPagoPreferencePayload {
  items: {
    id: string
    title: string
    quantity: number
    unit_price: number
    currency_id: string
  }[]
  external_reference: string
  notification_url: string
  back_urls: { success: string; failure: string; pending: string }
  auto_return?: 'approved'
}

/**
 * Monta o corpo da preferência. Função pura (testável) — não faz I/O.
 *
 * Uma única linha com o TOTAL do pedido (em reais), calculado no servidor a
 * partir de `Order.totalCents`. Assim o valor cobrado pelo Mercado Pago é
 * exatamente o total do pedido, sem risco de divergência por arredondamento de
 * itens/desconto/frete. `external_reference` = `Order.id` (o webhook usa isso
 * para reencontrar o pedido). `auto_return` só é enviado com base HTTPS — o
 * Mercado Pago rejeita `auto_return` com back_urls http (ex.: localhost).
 */
export function buildPreferencePayload(input: PreferenceInput): MercadoPagoPreferencePayload {
  const base = getPublicBaseUrl()
  const q = `?pedido=${input.orderNumber}`
  const payload: MercadoPagoPreferencePayload = {
    items: [
      {
        id: input.orderId,
        title: `Pedido #${input.orderNumber} — Loja Vênus`,
        quantity: 1,
        unit_price: centsToReais(input.totalCents),
        currency_id: input.currency || 'BRL',
      },
    ],
    external_reference: input.orderId,
    notification_url: `${base}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${base}/checkout/sucesso${q}`,
      failure: `${base}/checkout/falha${q}`,
      pending: `${base}/checkout/pendente${q}`,
    },
  }
  if (base.startsWith('https://')) payload.auto_return = 'approved'
  return payload
}

export interface CreatedPreference {
  id: string
  initPoint: string
}

export async function createCheckoutPreference(
  input: PreferenceInput,
): Promise<CreatedPreference> {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify(buildPreferencePayload(input)),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Mercado Pago: falha ao criar preferência (${res.status}) ${detail}`)
  }

  const data = (await res.json()) as {
    id?: string | number
    init_point?: string
    sandbox_init_point?: string
  }
  const initPoint = data.init_point || data.sandbox_init_point
  if (!data.id || !initPoint) {
    throw new Error('Mercado Pago: resposta de preferência sem id/init_point.')
  }
  return { id: String(data.id), initPoint }
}

// --- Consulta de pagamento -------------------------------------------------

export interface MercadoPagoPayment {
  id: string
  status: string
  externalReference: string | null
  transactionAmount: number
  currencyId: string
  paymentTypeId: string | null
  paymentMethodId: string | null
}

interface RawMpPayment {
  id: number | string
  status: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
  payment_type_id?: string | null
  payment_method_id?: string | null
}

function normalizePayment(raw: RawMpPayment): MercadoPagoPayment {
  return {
    id: String(raw.id),
    status: raw.status,
    externalReference: raw.external_reference ?? null,
    transactionAmount: raw.transaction_amount,
    currencyId: raw.currency_id,
    paymentTypeId: raw.payment_type_id ?? null,
    paymentMethodId: raw.payment_method_id ?? null,
  }
}

/** GET /v1/payments/{id}. Retorna `null` se o Mercado Pago responder 404. */
export async function getMercadoPagoPayment(
  paymentId: string,
): Promise<MercadoPagoPayment | null> {
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Mercado Pago: falha ao consultar pagamento (${res.status}) ${detail}`)
  }
  return normalizePayment((await res.json()) as RawMpPayment)
}

/** GET /v1/payments/search?external_reference=<orderId> — usado na reconsulta. */
export async function searchMercadoPagoPaymentsByOrder(
  orderId: string,
): Promise<MercadoPagoPayment[]> {
  const url =
    `${MP_API}/v1/payments/search?sort=date_created&criteria=desc` +
    `&external_reference=${encodeURIComponent(orderId)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Mercado Pago: falha na busca de pagamentos (${res.status}) ${detail}`)
  }
  const data = (await res.json()) as { results?: RawMpPayment[] }
  return (data.results ?? []).map(normalizePayment)
}

// --- Validação de assinatura do webhook ---------------------------------

export interface WebhookSignatureInput {
  /** Header `x-signature` (formato `ts=...,v1=...`). */
  xSignature: string | null
  /** Header `x-request-id`. */
  xRequestId: string | null
  /** Valor de `data.id` da notificação (query string `data.id`). */
  dataId: string | null
  /** `MERCADOPAGO_WEBHOOK_SECRET`. */
  secret: string | null | undefined
}

function parseXSignature(value: string): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {}
  for (const part of value.split(',')) {
    const [k, v] = part.split('=')
    const key = k?.trim()
    const val = v?.trim()
    if (key === 'ts') out.ts = val
    else if (key === 'v1') out.v1 = val
  }
  return out
}

/**
 * Valida a origem da notificação conforme o algoritmo oficial do Mercado Pago:
 * manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` assinado com
 * HMAC-SHA256 usando o segredo do webhook; compara com `v1` do header
 * `x-signature` em tempo constante. Função pura (sem I/O).
 */
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  if (!input.secret || !input.xSignature || !input.xRequestId || !input.dataId) {
    return false
  }
  const { ts, v1 } = parseXSignature(input.xSignature)
  if (!ts || !v1) return false

  // O Mercado Pago normaliza o id para minúsculas no manifesto.
  const id = input.dataId.toLowerCase()
  const manifest = `id:${id};request-id:${input.xRequestId};ts:${ts};`
  const expected = createHmac('sha256', input.secret).update(manifest).digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
