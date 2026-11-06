import { createHmac, timingSafeEqual } from 'node:crypto'

// Token de acesso à página pública de confirmação do pedido (`/checkout/sucesso`).
//
// O número do pedido é sequencial (fácil de adivinhar), então ele sozinho NUNCA
// autoriza a leitura de dados do pedido. O token é um HMAC-SHA256 do `Order.id`
// assinado com um segredo do servidor (AUTH_SECRET): só quem recebeu o link
// gerado no momento da compra consegue montá-lo. Não exige coluna nova no banco
// (sem migration) e não expõe o id interno do pedido na URL.
//
// Funções puras (o segredo é parâmetro) — testáveis sem env.

const TOKEN_CONTEXT = 'bc:order-confirmation:v1:'
/** 32 caracteres base64url = 192 bits do HMAC. */
const TOKEN_LENGTH = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

function sign(orderId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(TOKEN_CONTEXT + orderId)
    .digest('base64url')
    .slice(0, TOKEN_LENGTH)
}

/** Gera o token de confirmação. Lança se não houver segredo (falha fechada). */
export function createOrderAccessToken(orderId: string, secret: string | undefined): string {
  if (!secret) throw new Error('Segredo do token de pedido não configurado.')
  if (!orderId) throw new Error('orderId obrigatório.')
  return sign(orderId, secret)
}

/**
 * Confere o token em tempo constante. Retorna `false` (nunca lança) para
 * segredo ausente, token ausente/malformado ou assinatura divergente.
 */
export function verifyOrderAccessToken(
  orderId: string,
  token: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !orderId || typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    return false
  }
  const expected = Buffer.from(sign(orderId, secret))
  const received = Buffer.from(token)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Monta a query string das páginas de retorno: `?pedido=N&token=T`. */
export function orderReturnQuery(orderNumber: number, token: string): string {
  return `?pedido=${orderNumber}&token=${encodeURIComponent(token)}`
}

// --- Leitura segura dos parâmetros das páginas de retorno -------------------
// O navegador (e o Mercado Pago, que acrescenta os próprios parâmetros na volta)
// controla a query string. Nada dela é usado sem validação: o número só serve
// para localizar o pedido, e os dados só aparecem se o token conferir no servidor.

/** Inteiro positivo de até 10 dígitos, sem zeros à esquerda, sinais ou notação. */
const ORDER_NUMBER_PATTERN = /^[1-9]\d{0,9}$/
/** Maior valor de `Order.number` (coluna Int do PostgreSQL). */
const MAX_ORDER_NUMBER = 2_147_483_647

/**
 * `?pedido=` → número do pedido, ou `null` se ausente, repetido (array) ou fora
 * do formato. Recusa "1e3", "0x7", " 7", "-1", "07" etc., que `Number()` aceitaria.
 */
export function parseOrderNumberParam(value: unknown): number | null {
  if (typeof value !== 'string' || !ORDER_NUMBER_PATTERN.test(value)) return null
  const n = Number(value)
  return n <= MAX_ORDER_NUMBER ? n : null
}

/** `?token=` → string, ou `null` se ausente ou repetido. O formato é conferido em `verifyOrderAccessToken`. */
export function parseTokenParam(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
