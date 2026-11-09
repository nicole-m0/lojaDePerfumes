import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { centsToReais } from '@/lib/format'
import { orderReturnQuery } from '@/lib/order-access'
import { STORE_NAME } from '@/config/store'

// ---------------------------------------------------------------------------
// Cliente Mercado Pago — Checkout Pro (Fase 4).
//
// Sem SDK: chamadas REST diretas com `fetch`. O token de acesso e o segredo do
// webhook vêm SEMPRE de variáveis de ambiente, nunca do código.
//
// Esta loja é uma demonstração: só aceita token de teste (prefixo exato `TEST-`) e
// só redireciona para `sandbox_init_point`. Não há variável que libere credencial
// real — cobrar de verdade exige mudar este arquivo de propósito.
//
// Nada aqui decide estado de pagamento: a tradução do status do gateway para o
// nosso domínio é `mapMercadoPagoStatus` (src/lib/payment-status.ts) e a
// aplicação passa por `applyGatewayPaymentUpdate` (src/server/payments.ts).
// ---------------------------------------------------------------------------

const MP_API = 'https://api.mercadopago.com'

export const MERCADO_PAGO_PROVIDER = 'mercadopago'

/** Prefixo exato `TEST-` seguido de conteúdo, sem espaços ou quebras de linha. */
const DEMO_TOKEN_PATTERN = /^TEST-\S+$/

function isAllowedDemoToken(token: string | undefined): token is string {
  return typeof token === 'string' && DEMO_TOKEN_PATTERN.test(token)
}

/** `false` sem token ou com token que não seja de teste: a loja age como sem pagamento online. */
export function isMercadoPagoConfigured(): boolean {
  return isAllowedDemoToken(process.env.MERCADOPAGO_ACCESS_TOKEN)
}

/** URL pública do app — usada para back_urls e notification_url da preferência. */
export function getPublicBaseUrl(): string {
  const raw = process.env.AUTH_URL || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/**
 * Único ponto que entrega o token às chamadas à API: é avaliado antes de cada
 * `fetch`, então um token recusado nunca sai do servidor. A mensagem não cita o valor.
 */
function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!isAllowedDemoToken(token)) {
    throw new Error('Credencial do Mercado Pago ausente ou recusada: a demonstração só aceita token de teste.')
  }
  return token
}

// --- Preferência (Checkout Pro) -----------------------------------------

export interface PreferenceInput {
  orderId: string
  orderNumber: number
  totalCents: number
  currency: string
  /**
   * Token de confirmação do pedido (src/lib/order-access.ts). Quando presente, vai
   * nas back_urls para a página de retorno poder mostrar o resumo do pedido.
   */
  accessToken?: string
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
  const q = input.accessToken
    ? orderReturnQuery(input.orderNumber, input.accessToken)
    : `?pedido=${input.orderNumber}`
  const payload: MercadoPagoPreferencePayload = {
    items: [
      {
        id: input.orderId,
        title: `Pedido #${input.orderNumber} — ${STORE_NAME}`,
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

  // `init_point` é ignorado de propósito: sem `sandbox_init_point` não há redirecionamento.
  const data = (await res.json()) as {
    id?: string | number
    sandbox_init_point?: string
  }
  const initPoint = data.sandbox_init_point
  if (!data.id || !initPoint) {
    throw new Error('Mercado Pago: resposta de preferência sem id/sandbox_init_point.')
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
  /**
   * `live_mode` da API: `true` = pagamento de produção, `false` = teste. `null`
   * quando a API não informar. Só registrado (Etapa D3) — não bloqueia nada.
   */
  liveMode?: boolean | null
}

interface RawMpPayment {
  id: number | string
  status: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
  payment_type_id?: string | null
  payment_method_id?: string | null
  live_mode?: boolean | null
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
    liveMode: typeof raw.live_mode === 'boolean' ? raw.live_mode : null,
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

// --- Validação de entrada do webhook ---------------------------------------

/**
 * Id de pagamento do Mercado Pago: só dígitos, de 1 a 20 (os ids reais têm ~10–12;
 * 20 cobre qualquer inteiro de 64 bits). Recusa vazio, sinais, espaços, letras,
 * barras e qualquer coisa que pudesse alterar a URL da consulta à API.
 */
const PAYMENT_ID_PATTERN = /^\d{1,20}$/

export function isValidMercadoPagoPaymentId(id: unknown): id is string {
  return typeof id === 'string' && PAYMENT_ID_PATTERN.test(id)
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
