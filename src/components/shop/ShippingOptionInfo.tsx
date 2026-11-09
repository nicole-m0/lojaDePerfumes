import type { ShippingOption } from '../../lib/shipping/types'
import {
  DEMO_SHIPPING_BADGE,
  DEMO_SHIPPING_NOTICE,
  demoOptionDetail,
  formatDeliveryWindow,
} from '../../lib/shipping/demo'

// Apresentação de uma opção de frete no checkout — sem estado nem hooks, para ser
// usada pelo CheckoutForm (cliente) e testada com renderização no servidor.
// A opção simulada (modo demonstração) é sempre identificada: selo "Simulação" e
// texto dizendo que prazo e valor são fictícios.

export function ShippingOptionInfo({ option }: { option: ShippingOption }) {
  if (option.simulated) {
    return (
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
          {option.serviceName}
          <span className="border border-champagne-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-champagne-700">
            {DEMO_SHIPPING_BADGE}
          </span>
        </span>
        <span className="block text-xs text-ink-soft">{demoOptionDetail(option)}</span>
      </span>
    )
  }

  return (
    <span className="flex-1">
      <span className="font-medium text-ink">
        {option.carrier ? `${option.carrier} · ` : ''}
        {option.serviceName}
      </span>
      <span className="block text-xs text-ink-soft">
        {formatDeliveryWindow(option.deliveryDaysMin, option.deliveryDaysMax) ?? 'prazo a confirmar'}
      </span>
    </span>
  )
}

/** Nota abaixo das opções: aviso de simulação no modo demo, reconfirmação no real. */
export function ShippingFootnote({ simulated }: { simulated: boolean }) {
  if (simulated) {
    return (
      <p className="border-l-2 border-champagne-500 bg-sand-50 px-4 py-3 text-xs text-ink" role="note">
        {DEMO_SHIPPING_NOTICE}
      </p>
    )
  }
  return (
    <p className="text-xs text-ink-soft">
      O valor do frete é reconfirmado com a transportadora ao concluir o pedido.
    </p>
  )
}
