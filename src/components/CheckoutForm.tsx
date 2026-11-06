'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useCart } from '../context/useCart'
import {
  createWebsiteOrder,
  getCartPricing,
  quoteCartShipping,
  type CartPricing,
  type CheckoutFormState,
} from '../app/(shop)/checkout/actions'
import { isValidZip, normalizeZip } from '../lib/shipping/cep'
import { lookupZip } from '../lib/shipping/viacep'
import type { ShippingOption } from '../lib/shipping/types'
import { formatCents } from '../lib/format'
import AddressFields, { EMPTY_ADDRESS, type AddressValue } from './AddressFields'
import OrderSummary from './OrderSummary'
import { buttonClasses } from './shop/ui'
import { ShippingFootnote, ShippingOptionInfo } from './shop/ShippingOptionInfo'

const inputClass =
  'mt-2 h-12 w-full border border-ink/20 bg-ivory px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-ink'
const labelClass = 'text-xs font-medium tracking-wide text-ink-soft'

/** Título numerado das etapas do checkout. */
function StepTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline gap-4 text-3xl font-medium text-ink">
      <span className="font-sans text-xs font-semibold tabular-nums text-champagne-600">{n}</span>
      {children}
    </h2>
  )
}

export default function CheckoutForm({
  nonce,
  onlinePayment,
}: {
  nonce: string
  /** Mercado Pago configurado neste ambiente (define o texto de pagamento). */
  onlinePayment: boolean
}) {
  const { items, isHydrated } = useCart()
  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    createWebsiteOrder,
    {},
  )
  const [pricing, setPricing] = useState<CartPricing | null>(null)
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)

  // ViaCEP — preenchimento assistido do endereço.
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'ok' | 'notfound'>('idle')
  const lastLookedUpZip = useRef<string>('')

  // Frete (Melhor Envio ou simulado) — cotado sob demanda; o preço só vale após recotar no submit.
  const [shipOptions, setShipOptions] = useState<ShippingOption[] | null>(null)
  const [shipError, setShipError] = useState<string | null>(null)
  const [selectedService, setSelectedService] = useState('')
  const [quoting, startQuote] = useTransition()

  const cartKey = useMemo(
    () => items.map((i) => `${i.product.id}:${i.quantity}`).join('|'),
    [items],
  )
  const zipDigits = normalizeZip(address.zipCode)

  useEffect(() => {
    let active = true
    getCartPricing(items.map((i) => ({ productId: i.product.id, quantity: i.quantity })))
      .then((r) => active && setPricing(r))
      .catch(() => active && setPricing(null))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  // Uma cotação de frete vale para um CEP + carrinho específicos. Qualquer
  // mudança invalida as opções — o cliente recalcula.
  useEffect(() => {
    setShipOptions(null)
    setShipError(null)
    setSelectedService('')
  }, [cartKey, zipDigits])

  // ViaCEP: dispara quando o CEP fica com 8 dígitos, com um pequeno debounce.
  useEffect(() => {
    if (zipDigits.length !== 8) {
      setCepStatus('idle')
      return
    }
    if (zipDigits === lastLookedUpZip.current) return

    const handle = setTimeout(() => {
      lastLookedUpZip.current = zipDigits
      setCepStatus('loading')
      lookupZip(zipDigits)
        .then((found) => {
          if (!found) {
            setCepStatus('notfound')
            return
          }
          setCepStatus('ok')
          setAddress((prev) => ({
            ...prev,
            state: found.state || prev.state,
            city: found.city || prev.city,
            // Rua/bairro só sobrescrevem se o ViaCEP tiver o dado (CEP geral de
            // cidade vem sem logradouro) — não apaga o que o cliente digitou.
            street: found.street || prev.street,
            neighborhood: found.neighborhood || prev.neighborhood,
          }))
        })
        .catch(() => setCepStatus('notfound'))
    }, 500)
    return () => clearTimeout(handle)
  }, [zipDigits])

  const itemsJson = useMemo(
    () =>
      JSON.stringify(items.map((i) => ({ productId: i.product.id, quantity: i.quantity }))),
    [items],
  )

  if (!isHydrated) {
    return (
      <div aria-busy="true" className="h-64 border-t border-hairline">
        <span className="sr-only">Carregando sua sacola…</span>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 border-t border-hairline py-16">
        <p className="font-display text-4xl text-ink">Sua sacola está vazia.</p>
        <p className="text-sm text-ink-soft">Adicione produtos antes de finalizar a compra.</p>
        <Link href="/#catalogo" className={buttonClasses('primary', 'md', 'mt-2')}>
          Explorar a loja
        </Link>
      </div>
    )
  }

  const selectedOption = shipOptions?.find((o) => o.serviceCode === selectedService) ?? null
  const shippingCents = selectedOption?.priceCents ?? 0
  const shippingSimulated = Boolean(shipOptions?.some((o) => o.simulated))
  const subtotalCents = pricing?.subtotalCents ?? 0
  const discountCents = pricing?.discountCents ?? 0
  const totalCents = subtotalCents - discountCents + shippingCents

  const blocked =
    !pricing ||
    pricing.isEmpty ||
    pricing.hasUnavailable ||
    pricing.hasInsufficientStock ||
    !selectedOption

  function handleQuote() {
    if (!isValidZip(zipDigits)) {
      setShipError('Informe um CEP válido para calcular o frete.')
      setShipOptions(null)
      return
    }
    startQuote(async () => {
      const result = await quoteCartShipping({
        destZip: zipDigits,
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      })
      if (result.error) {
        setShipError(result.error)
        setShipOptions(null)
        setSelectedService('')
        return
      }
      setShipError(null)
      setShipOptions(result.options ?? [])
      setSelectedService(result.options?.[0]?.serviceCode ?? '')
    })
  }

  return (
    <form action={formAction} className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <input type="hidden" name="nonce" value={nonce} />
      <input type="hidden" name="items" value={itemsJson} />
      <input type="hidden" name="shippingServiceCode" value={selectedService} />

      {/* Resumo recolhível no topo (celular/tablet) */}
      <details className="group border-y border-hairline lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-ink">
            <span className="group-open:hidden">Ver resumo do pedido</span>
            <span className="hidden group-open:inline">Ocultar resumo</span>
          </span>
          <span className="font-semibold tabular-nums text-ink">{formatCents(totalCents)}</span>
        </summary>
        <div className="pb-5">
          <OrderSummary
            subtotalCents={subtotalCents}
            discountCents={discountCents}
            shippingCents={shippingCents}
            totalCents={totalCents}
            shippingSimulated={Boolean(selectedOption?.simulated)}
          />
        </div>
      </details>

      <div className="space-y-14 lg:col-span-7">
        <section className="space-y-6">
          <StepTitle n="01">Contato</StepTitle>
          <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
            <label className="sm:col-span-2 block">
              <span className={labelClass}>Nome completo</span>
              <input name="customerName" required autoComplete="name" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>E-mail</span>
              <input name="customerEmail" type="email" autoComplete="email" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Telefone</span>
              <input name="customerPhone" inputMode="tel" autoComplete="tel" className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-ink-soft">Informe ao menos um e-mail ou telefone.</p>
        </section>

        <section className="space-y-6">
          <StepTitle n="02">Entrega</StepTitle>
          <AddressFields
            value={address}
            onChange={(patch) => setAddress((prev) => ({ ...prev, ...patch }))}
            zipHint={
              cepStatus === 'loading' ? (
                <span className="mt-1.5 block text-xs text-ink-soft" role="status">
                  Buscando endereço…
                </span>
              ) : cepStatus === 'notfound' ? (
                <span className="mt-1.5 block text-xs text-amber-800" role="status">
                  CEP não encontrado — preencha o endereço manualmente.
                </span>
              ) : null
            }
          />
        </section>

        <section className="space-y-6">
          <StepTitle n="03">Frete</StepTitle>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleQuote}
              disabled={quoting || zipDigits.length !== 8}
              className={buttonClasses('outline', 'md')}
            >
              {quoting ? 'Calculando…' : 'Calcular frete'}
            </button>
            {zipDigits.length !== 8 && (
              <span className="text-xs text-ink-soft">Informe o CEP de entrega acima.</span>
            )}
          </div>

          {shipError && (
            <p className="border-l-2 border-red-700 bg-red-50 px-4 py-3 text-xs text-red-800" role="alert">
              {shipError}
            </p>
          )}

          {shipOptions && shipOptions.length > 0 && (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {shipOptions.map((o) => (
                <li key={o.serviceCode}>
                  <label className="flex cursor-pointer items-center gap-4 px-1 py-4 text-sm transition-colors has-[:checked]:bg-sand-50">
                    <input
                      type="radio"
                      name="shippingOption"
                      value={o.serviceCode}
                      checked={selectedService === o.serviceCode}
                      onChange={() => setSelectedService(o.serviceCode)}
                      className="h-4 w-4 accent-ink"
                    />
                    <ShippingOptionInfo option={o} />
                    <span className="font-semibold tabular-nums text-ink">{formatCents(o.priceCents)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <ShippingFootnote simulated={shippingSimulated} />
        </section>

        <section className="space-y-6">
          <StepTitle n="04">Pagamento</StepTitle>
          <p className="max-w-prose text-sm leading-relaxed text-ink/85">
            {onlinePayment ? (
              <>
                Ao concluir o pedido você será levado ao ambiente seguro do{' '}
                <span className="font-semibold">Mercado Pago</span> para pagar com PIX, cartão ou
                boleto. O pagamento é registrado no pedido quando o Mercado Pago o aprovar.
              </>
            ) : (
              <>
                Este ambiente não tem pagamento online configurado: o pedido é registrado e a
                loja combina a forma de pagamento pelo contato informado.
              </>
            )}
          </p>
        </section>
      </div>

      <aside
        aria-label="Resumo do pedido"
        className="h-fit space-y-5 bg-sand-50 p-6 sm:p-8 lg:sticky lg:top-32 lg:col-span-5"
      >
        <p className="eyebrow hidden text-ink-soft lg:block">Resumo do pedido</p>
        <div className="hidden lg:block">
          <OrderSummary
            subtotalCents={subtotalCents}
            discountCents={discountCents}
            shippingCents={shippingCents}
            totalCents={totalCents}
            shippingSimulated={Boolean(selectedOption?.simulated)}
          />
        </div>

        {(pricing?.hasUnavailable || pricing?.hasInsufficientStock) && (
          <p className="border-l-2 border-red-700 bg-ivory px-4 py-3 text-xs text-red-800">
            {pricing.hasUnavailable
              ? 'Há itens indisponíveis no carrinho.'
              : 'Há itens com quantidade acima do estoque disponível.'}{' '}
            <Link href="/carrinho" className="underline">
              Revisar
            </Link>
          </p>
        )}

        {!selectedOption && !pricing?.hasUnavailable && !pricing?.hasInsufficientStock && (
          <p className="border-l-2 border-champagne-500 bg-ivory px-4 py-3 text-xs text-ink">
            Calcule o frete e escolha uma opção para concluir.
          </p>
        )}

        {state.error && (
          <p className="border-l-2 border-red-700 bg-ivory px-4 py-3 text-xs text-red-800" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || blocked}
          className={buttonClasses('primary', 'lg', 'w-full')}
        >
          {isPending ? 'Enviando pedido…' : 'Concluir pedido'}
        </button>

        <Link
          href="/carrinho"
          className="link-underline mx-auto block w-fit pb-0.5 text-xs text-ink-soft hover:text-ink"
        >
          Voltar à sacola
        </Link>
      </aside>
    </form>
  )
}
