'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useCart } from '../context/useCart'
import {
  createWebsiteOrder,
  getCartPricing,
  type CartPricing,
  type CheckoutFormState,
} from '../app/(shop)/checkout/actions'
import AddressFields from './AddressFields'
import OrderSummary from './OrderSummary'

const inputClass =
  'mt-1 w-full rounded-lg border border-venus-100 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition focus:border-venus-300 focus:ring-2 focus:ring-venus-200'
const labelClass = 'text-xs font-medium text-neutral-600'

export default function CheckoutForm({ nonce }: { nonce: string }) {
  const { items } = useCart()
  const [state, formAction, isPending] = useActionState<CheckoutFormState, FormData>(
    createWebsiteOrder,
    {},
  )
  const [pricing, setPricing] = useState<CartPricing | null>(null)

  const cartKey = useMemo(
    () => items.map((i) => `${i.product.id}:${i.quantity}`).join('|'),
    [items],
  )

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

  const blocked = !pricing || pricing.isEmpty || pricing.hasUnavailable

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="nonce" value={nonce} />
      <input type="hidden" name="items" value={itemsJson} />

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
          <AddressFields />
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
          subtotalCents={pricing?.subtotalCents ?? 0}
          discountCents={pricing?.discountCents ?? 0}
          shippingCents={pricing?.shippingCents ?? 0}
          totalCents={pricing?.totalCents ?? 0}
        />

        {pricing?.hasUnavailable && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Há itens indisponíveis no carrinho.{' '}
            <Link href="/carrinho" className="underline">
              Revisar
            </Link>
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
