// Frete demonstrativo (Etapa D1) — usado SÓ quando o Melhor Envio não está
// configurado E `SHIPPING_DEMO_MODE=true`. Valor e prazo são fictícios: nenhuma
// transportadora é consultada e nada é enviado. Toda a interface que mostra esta
// opção (checkout e painel) a identifica como simulação.
//
// Módulo puro, sem `server-only`: os textos e o reconhecimento do provider são
// usados também por componentes de cliente. As funções que leem variáveis de
// ambiente só fazem sentido no servidor (no navegador elas veem `undefined`).

import type { ShippingOption } from './types'

/** Provider gravado em `ShippingQuote.provider` para cotações do Melhor Envio. */
export const MELHORENVIO_SHIPPING_PROVIDER = 'melhorenvio'
/** Provider gravado em `ShippingQuote.provider` para o frete demonstrativo. */
export const DEMO_SHIPPING_PROVIDER = 'demo'

export type ShippingProvider =
  | typeof MELHORENVIO_SHIPPING_PROVIDER
  | typeof DEMO_SHIPPING_PROVIDER

export const DEMO_SERVICE_CODE = 'demo-flat'
export const DEMO_SERVICE_NAME = 'Frete simulado'
export const DEMO_CARRIER = 'Demonstração'

/** Valor padrão do frete simulado: R$ 19,90. */
export const DEFAULT_DEMO_FLAT_RATE_CENTS = 1990
/** Teto aceito para `SHIPPING_DEMO_FLAT_CENTS` (R$ 1.000,00) — barra valores absurdos. */
export const MAX_DEMO_FLAT_RATE_CENTS = 100_000

/** Prazo fictício exibido (dias úteis). */
export const DEMO_DELIVERY_DAYS_MIN = 5
export const DEMO_DELIVERY_DAYS_MAX = 8

type Env = Record<string, string | undefined>

/** Modo demo ligado apenas com o valor exato `"true"` (sem espaços, minúsculo). */
export function isDemoShippingEnabled(env: Env = process.env): boolean {
  return env.SHIPPING_DEMO_MODE === 'true'
}

/**
 * Valor do frete simulado em centavos. `SHIPPING_DEMO_FLAT_CENTS` é opcional: se
 * ausente ou inválido (não inteiro, negativo, acima do teto), usa o padrão.
 */
export function getDemoFlatRateCents(env: Env = process.env): number {
  const raw = env.SHIPPING_DEMO_FLAT_CENTS?.trim()
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_DEMO_FLAT_RATE_CENTS
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value > MAX_DEMO_FLAT_RATE_CENTS) {
    return DEFAULT_DEMO_FLAT_RATE_CENTS
  }
  return value
}

/** A única opção oferecida no modo demo. */
export function buildDemoShippingOption(priceCents: number): ShippingOption {
  return {
    serviceCode: DEMO_SERVICE_CODE,
    serviceName: DEMO_SERVICE_NAME,
    carrier: DEMO_CARRIER,
    priceCents,
    deliveryDaysMin: DEMO_DELIVERY_DAYS_MIN,
    deliveryDaysMax: DEMO_DELIVERY_DAYS_MAX,
    simulated: true,
  }
}

export function isDemoShippingProvider(provider: string | null | undefined): boolean {
  return provider === DEMO_SHIPPING_PROVIDER
}

// --- Textos (checkout e painel) --------------------------------------------

/** "5–8 dias úteis", "3 dias úteis" ou `null` quando não há prazo. */
export function formatDeliveryWindow(min: number | null, max: number | null): string | null {
  if (max == null) return null
  if (min && min !== max) return `${min}–${max} dias úteis`
  return `${max} dias úteis`
}

export const DEMO_SHIPPING_BADGE = 'Simulação'

/** Linha de detalhe da opção simulada no checkout. */
export function demoOptionDetail(option: Pick<ShippingOption, 'deliveryDaysMin' | 'deliveryDaysMax'>): string {
  const window = formatDeliveryWindow(option.deliveryDaysMin, option.deliveryDaysMax)
  return `Prazo fictício${window ? ` de ${window}` : ''} · valor fictício — nenhum envio real será feito.`
}

/** Aviso exibido abaixo das opções quando o frete é simulado. */
export const DEMO_SHIPPING_NOTICE =
  'Loja de demonstração: o frete é simulado, com valor e prazo fictícios. ' +
  'Nenhuma transportadora é consultada e nenhum produto será enviado.'

/** Aviso no painel, no resumo do frete do pedido. */
export const DEMO_SHIPPING_ADMIN_NOTICE =
  'Frete simulado (modo demonstração): valor e prazo fictícios, sem cotação em ' +
  'transportadora. Este pedido não tem envio real.'
