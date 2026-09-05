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

const inputClass =
  'mt-1 w-full rounded-lg border border-venus-100 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-venus-300 focus:ring-2 focus:ring-venus-200'
const labelClass = 'text-xs font-medium text-neutral-600'

function deliveryText(o: ShippingOption): string {
  if (o.deliveryDaysMax == null) return 'prazo a confirmar'
  if (o.deliveryDaysMin && o.deliveryDaysMin !== o.deliveryDaysMax) {
    return `${o.deliveryDaysMin}–${o.deliveryDaysMax} dias úteis`
  }
  return `${o.deliveryDaysMax} dias úteis`
}

export default function CheckoutForm({ nonce }: { nonce: string }) {
  const { items } = useCart()
  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    createWebsiteOrder,
    {},
  )
  const [pricing, setPricing] = useState<CartPricing | null>(null)
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)

  // ViaCEP — preenchimento assistido do endereço.
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'ok' | 'notfound'>('idle')
  const lastLookedUpZip = useRef<string>('')

  // Frete (Melhor Envio) — cotado sob demanda; o preço só vale após recotar no submit.
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-venus-100 bg-white py-12 text-center">
        <p className="text-sm text-neutral-500">Seu carrinho está vazio.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
        >
          Explorar produtos
        </Link>
      </div>
    )
  }

  const selectedOption = shipOptions?.find((o) => o.serviceCode === selectedService) ?? null
  const shippingCents = selectedOption?.priceCents ?? 0
  const subtotalCents = pricing?.subtotalCents ?? 0
  const discountCents = pricing?.discountCents ?? 0
  const totalCents = subtotalCents - discountCents + shippingCents

  const blocked =
    !pricing || pricing.isEmpty || pricing.hasUnavailable || !selectedOption

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
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="nonce" value={nonce} />
      <input type="hidden" name="items" value={itemsJson} />
      <input type="hidden" name="shippingServiceCode" value={selectedService} />

      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-800">Contato</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 block">
              <span className={labelClass}>Nome completo</span>
              <input name="customerName" required className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>E-mail</span>
              <input name="customerEmail" type="email" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Telefone</span>
              <input name="customerPhone" inputMode="tel" className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-neutral-400">Informe ao menos um e-mail ou telefone.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-800">Endereço de entrega</h2>
          <AddressFields
            value={address}
            onChange={(patch) => setAddress((prev) => ({ ...prev, ...patch }))}
            zipHint={
              cepStatus === 'loading' ? (
                <span className="mt-1 block text-xs text-neutral-400">Buscando endereço…</span>
              ) : cepStatus === 'notfound' ? (
                <span className="mt-1 block text-xs text-amber-600">
                  CEP não encontrado — preencha o endereço manualmente.
                </span>
              ) : null
            }
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-800">Frete</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleQuote}
              disabled={quoting || zipDigits.length !== 8}
              className="rounded-full border border-venus-200 px-4 py-2 text-sm font-semibold text-venus-700 transition hover:bg-venus-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quoting ? 'Calculando…' : 'Calcular frete'}
            </button>
            {zipDigits.length !== 8 && (
              <span className="text-xs text-neutral-400">Informe o CEP acima.</span>
            )}
          </div>

          {shipError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
              {shipError}
            </p>
          )}

          {shipOptions && shipOptions.length > 0 && (
            <ul className="space-y-2">
              {shipOptions.map((o) => (
                <li key={o.serviceCode}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-venus-100 px-3 py-2.5 text-sm transition has-[:checked]:border-venus-400 has-[:checked]:bg-venus-50/60">
                    <input
                      type="radio"
                      name="shippingOption"
                      value={o.serviceCode}
                      checked={selectedService === o.serviceCode}
                      onChange={() => setSelectedService(o.serviceCode)}
                      className="text-venus-600"
                    />
                    <span className="flex-1">
                      <span className="font-medium text-neutral-800">
                        {o.carrier ? `${o.carrier} · ` : ''}
                        {o.serviceName}
                      </span>
                      <span className="block text-xs text-neutral-500">{deliveryText(o)}</span>
                    </span>
                    <span className="font-semibold text-venus-700">{formatCents(o.priceCents)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="rounded-lg border border-venus-100 bg-venus-50/60 px-3 py-2.5 text-xs text-neutral-500">
            O valor do frete é reconfirmado com a transportadora ao concluir o pedido.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-800">Pagamento</h2>
          <p className="rounded-lg border border-venus-100 bg-venus-50/60 px-3 py-2.5 text-sm text-neutral-600">
            Ao concluir o pedido você será levado ao ambiente seguro do{' '}
            <span className="font-semibold">Mercado Pago</span> para pagar com PIX, cartão ou
            boleto. A confirmação é feita automaticamente assim que o pagamento é aprovado.
          </p>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-venus-100 bg-white p-5">
        <OrderSummary
          subtotalCents={subtotalCents}
          discountCents={discountCents}
          shippingCents={shippingCents}
          totalCents={totalCents}
        />

        {pricing?.hasUnavailable && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Há itens indisponíveis no carrinho.{' '}
            <Link href="/carrinho" className="underline">
              Revisar
            </Link>
          </p>
        )}

        {!selectedOption && !pricing?.hasUnavailable && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Calcule o frete e escolha uma opção para concluir.
          </p>
        )}

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || blocked}
          className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-venus-500 to-venus-600 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Enviando pedido...' : 'Concluir pedido'}
        </button>

        <Link
          href="/carrinho"
          className="block text-center text-xs font-medium text-neutral-400 transition hover:text-venus-600"
        >
          Voltar ao carrinho
        </Link>
      </aside>
    </form>
  )
}
