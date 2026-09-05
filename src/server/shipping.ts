import 'server-only'
import { aggregatePackage, declaredValueCents } from '@/lib/shipping/package'
import {
  calculateShipping,
  getShippingOriginZip,
  isMelhorEnvioConfigured,
} from '@/lib/shipping/melhorenvio'
import { isValidZip, normalizeZip } from '@/lib/shipping/cep'
import type { PackageDimensions, ShippingItemInput, ShippingOption } from '@/lib/shipping/types'

// ---------------------------------------------------------------------------
// Orquestração de frete (Fase 5) — cola entre o carrinho e o Melhor Envio.
//
//  - valida CEP de destino e a configuração do provedor;
//  - agrega os itens num pacote único (src/lib/shipping/package.ts);
//  - cota no Melhor Envio com cache curto em memória (mesma origem+destino+pacote);
//  - degrada com erro tipado — o checkout BLOQUEIA o avanço para pagamento quando
//    não há cotação (decisão da fase: nunca criar pedido com frete desconhecido).
//
// NUNCA confia em preço vindo do cliente: o checkout recota aqui no submit e usa
// o valor daqui como autoritativo (ver src/app/(shop)/checkout/actions.ts).
// ---------------------------------------------------------------------------

/** Erro esperado: provedor não configurado, CEP inválido, rede fora, sem opções. */
export class ShippingUnavailableError extends Error {}

const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  at: number
  options: ShippingOption[]
}
const rateCache = new Map<string, CacheEntry>()

/** Só para testes — zera o cache entre casos. */
export function __clearShippingCache(): void {
  rateCache.clear()
}

function cacheKey(originZip: string, destZip: string, pkg: PackageDimensions): string {
  return [originZip, destZip, pkg.weightGrams, pkg.heightCm, pkg.widthCm, pkg.lengthCm].join('|')
}

export interface QuoteShippingInput {
  destZip: string
  items: ShippingItemInput[]
  /**
   * Ignora o cache e força uma cotação nova no provedor. Usado na criação do
   * pedido: o preço travado em `Order.shippingCents` tem de refletir o provedor
   * no ato da compra — o cache só serve para a tela de checkout (botão "calcular").
   * O resultado novo ainda é gravado no cache.
   */
  skipCache?: boolean
}

export interface ShippingQuoteResult {
  originZip: string
  destZip: string
  package: PackageDimensions
  options: ShippingOption[]
}

export interface ShippingDeps {
  calculate: typeof calculateShipping
  now: () => number
}

const defaultDeps: ShippingDeps = { calculate: calculateShipping, now: () => Date.now() }

/**
 * Cota o frete para o conteúdo do carrinho. Lança `ShippingUnavailableError` se o
 * provedor não estiver configurado, o CEP for inválido, a chamada falhar ou não
 * houver nenhuma opção para o destino.
 */
export async function quoteShippingForCart(
  input: QuoteShippingInput,
  deps: ShippingDeps = defaultDeps,
): Promise<ShippingQuoteResult> {
  if (!isMelhorEnvioConfigured()) {
    throw new ShippingUnavailableError('Cálculo de frete indisponível no momento.')
  }

  const destZip = normalizeZip(input.destZip)
  if (!isValidZip(destZip)) {
    throw new ShippingUnavailableError('CEP de destino inválido.')
  }

  const positiveItems = input.items.filter((i) => i.quantity > 0)
  if (positiveItems.length === 0) {
    throw new ShippingUnavailableError('Carrinho sem itens para calcular o frete.')
  }

  const originZip = getShippingOriginZip()
  const pkg = aggregatePackage(positiveItems)
  const key = cacheKey(originZip, destZip, pkg)

  if (!input.skipCache) {
    const cached = rateCache.get(key)
    if (cached && deps.now() - cached.at < CACHE_TTL_MS) {
      return { originZip, destZip, package: pkg, options: cached.options }
    }
  }

  let options: ShippingOption[]
  try {
    options = await deps.calculate({
      originZip,
      destZip,
      pkg,
      declaredValueCents: declaredValueCents(positiveItems),
    })
  } catch (err) {
    console.error('[quoteShippingForCart]', err)
    throw new ShippingUnavailableError('Não foi possível calcular o frete agora. Tente novamente.')
  }

  if (options.length === 0) {
    throw new ShippingUnavailableError('Nenhuma opção de frete disponível para este CEP.')
  }

  rateCache.set(key, { at: deps.now(), options })
  return { originZip, destZip, package: pkg, options }
}

/**
 * Reencontra a opção que o cliente escolheu dentro de uma cotação fresca. O
 * `serviceCode` vindo do cliente é só uma referência — o preço usado é sempre o
 * desta cotação server-side.
 */
export function resolveShippingSelection(
  quote: ShippingQuoteResult,
  serviceCode: string,
): ShippingOption {
  const option = quote.options.find((o) => o.serviceCode === serviceCode)
  if (!option) {
    throw new ShippingUnavailableError(
      'A opção de frete escolhida não está mais disponível. Recalcule o frete.',
    )
  }
  return option
}
