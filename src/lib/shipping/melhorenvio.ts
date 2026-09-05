import 'server-only'
import { centsToReais, reaisToCents } from '@/lib/format'
import { normalizeZip } from './cep'
import type { PackageDimensions, ShippingOption } from './types'

// ---------------------------------------------------------------------------
// Cliente Melhor Envio — cotação de frete (Fase 5).
//
// Sem SDK: chamadas REST diretas com `fetch` (mesmo padrão de src/lib/mercadopago.ts).
// O token e o CEP de origem vêm SEMPRE de variáveis de ambiente, nunca do código.
// Esta fase é validada em sandbox — `MELHORENVIO_SANDBOX` controla a base da API.
//
// Nada aqui decide preço de pedido: devolve opções normalizadas. Quem recota no
// checkout e trava o valor em Order.shippingCents é src/server/shipping.ts.
// ---------------------------------------------------------------------------

const SANDBOX_BASE = 'https://sandbox.melhorenvio.com.br'
const PRODUCTION_BASE = 'https://www.melhorenvio.com.br'

/** Serviços cotados por padrão: 1 = Correios PAC, 2 = Correios SEDEX. */
const DEFAULT_SERVICE_IDS = '1,2'

export function isMelhorEnvioConfigured(): boolean {
  return Boolean(process.env.MELHORENVIO_TOKEN) && /^\d{8}$/.test(getShippingOriginZip())
}

/** CEP de origem da loja (`SHIPPING_ORIGIN_ZIP`), só dígitos. '' se não definido. */
export function getShippingOriginZip(): string {
  return normalizeZip(process.env.SHIPPING_ORIGIN_ZIP)
}

/** Base da API: sandbox por padrão; produção só com `MELHORENVIO_SANDBOX=false`. */
export function melhorEnvioBaseUrl(): string {
  return process.env.MELHORENVIO_SANDBOX === 'false' ? PRODUCTION_BASE : SANDBOX_BASE
}

/**
 * O Melhor Envio exige um User-Agent que identifique a aplicação e um e-mail de
 * contato (`App (email@dominio)`). Vem de `MELHORENVIO_USER_AGENT` para não fixar
 * dados pessoais no código; cai num rótulo neutro se não definido.
 */
function melhorEnvioUserAgent(): string {
  return process.env.MELHORENVIO_USER_AGENT || 'Loja Venus'
}

function melhorEnvioServices(): string {
  return process.env.MELHORENVIO_SERVICES || DEFAULT_SERVICE_IDS
}

function accessToken(): string {
  const token = process.env.MELHORENVIO_TOKEN
  if (!token) throw new Error('MELHORENVIO_TOKEN não configurado.')
  return token
}

// --- Payload de cotação (função pura, testável) ------------------------

export interface CalculateInput {
  originZip: string
  destZip: string
  pkg: PackageDimensions
  declaredValueCents: number
}

export interface MelhorEnvioCalculatePayload {
  from: { postal_code: string }
  to: { postal_code: string }
  package: { height: number; width: number; length: number; weight: number }
  options: { insurance_value: number; receipt: boolean; own_hand: boolean }
  services: string
}

/**
 * Monta o corpo de `POST /api/v2/me/shipment/calculate`. Peso vai em KG (o banco
 * guarda gramas); dimensões em cm; `insurance_value` em reais (valor declarado).
 */
export function buildCalculatePayload(input: CalculateInput): MelhorEnvioCalculatePayload {
  return {
    from: { postal_code: normalizeZip(input.originZip) },
    to: { postal_code: normalizeZip(input.destZip) },
    package: {
      height: input.pkg.heightCm,
      width: input.pkg.widthCm,
      length: input.pkg.lengthCm,
      // Gramas (inteiro no banco) -> kg com no máx. 3 casas.
      weight: input.pkg.weightGrams / 1000,
    },
    options: {
      insurance_value: centsToReais(Math.max(0, input.declaredValueCents)),
      receipt: false,
      own_hand: false,
    },
    services: melhorEnvioServices(),
  }
}

// --- Normalização da resposta (função pura, testável) -----------------

interface RawMelhorEnvioRate {
  id?: number | string
  name?: string
  price?: number | string
  delivery_time?: number
  delivery_range?: { min?: number; max?: number }
  company?: { name?: string }
  error?: string | null
}

/**
 * Converte a resposta do Melhor Envio em `ShippingOption[]`. Descarta serviços
 * com `error` (sem cobertura, pacote fora do limite etc.) ou sem preço. Ordena do
 * mais barato para o mais caro.
 */
export function normalizeRates(raw: unknown): ShippingOption[] {
  if (!Array.isArray(raw)) return []
  const options: ShippingOption[] = []
  for (const entry of raw as RawMelhorEnvioRate[]) {
    if (!entry || entry.error || entry.price == null || entry.id == null) continue
    const priceCents = reaisToCents(String(entry.price))
    if (priceCents <= 0) continue
    const min = entry.delivery_range?.min ?? null
    const max = entry.delivery_range?.max ?? entry.delivery_time ?? null
    options.push({
      serviceCode: String(entry.id),
      serviceName: entry.name ?? 'Serviço',
      carrier: entry.company?.name ?? '',
      priceCents,
      deliveryDaysMin: min,
      deliveryDaysMax: max,
    })
  }
  return options.sort((a, b) => a.priceCents - b.priceCents)
}

// --- Chamada HTTP ----------------------------------------------------------

export async function calculateShipping(input: CalculateInput): Promise<ShippingOption[]> {
  const res = await fetch(`${melhorEnvioBaseUrl()}/api/v2/me/shipment/calculate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken()}`,
      'User-Agent': melhorEnvioUserAgent(),
    },
    body: JSON.stringify(buildCalculatePayload(input)),
    cache: 'no-store',
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Melhor Envio: falha ao cotar frete (${res.status}) ${detail}`)
  }

  return normalizeRates(await res.json())
}
