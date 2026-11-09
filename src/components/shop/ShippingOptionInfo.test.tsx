import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShippingFootnote, ShippingOptionInfo } from './ShippingOptionInfo'
import OrderSummary from '../OrderSummary'
import { buildDemoShippingOption } from '../../lib/shipping/demo'

// Identificação visual do frete simulado no checkout (Etapa D1).

const realOption = {
  serviceCode: '1',
  serviceName: 'PAC',
  carrier: 'Correios',
  priceCents: 2340,
  deliveryDaysMin: 6,
  deliveryDaysMax: 8,
}

describe('ShippingOptionInfo', () => {
  it('opção simulada mostra o selo "Simulação" e prazo/valor fictícios', () => {
    const html = renderToStaticMarkup(<ShippingOptionInfo option={buildDemoShippingOption(1990)} />)

    expect(html).toContain('Frete simulado')
    expect(html).toContain('Simulação')
    expect(html).toContain('Prazo fictício de 5–8 dias úteis')
    expect(html).toContain('valor fictício')
    expect(html).toContain('nenhum envio real será feito')
    // A "transportadora" fictícia não aparece como se fosse real.
    expect(html).not.toContain('Demonstração ·')
  })

  it('opção real mantém transportadora · serviço e prazo, sem selo', () => {
    const html = renderToStaticMarkup(<ShippingOptionInfo option={realOption} />)

    expect(html).toContain('Correios · PAC')
    expect(html).toContain('6–8 dias úteis')
    expect(html).not.toContain('Simulação')
    expect(html).not.toContain('fictício')
  })

  it('opção real sem prazo mostra "prazo a confirmar"', () => {
    const html = renderToStaticMarkup(
      <ShippingOptionInfo option={{ ...realOption, deliveryDaysMax: null }} />,
    )
    expect(html).toContain('prazo a confirmar')
  })
})

describe('ShippingFootnote', () => {
  it('modo demo exibe o aviso de simulação', () => {
    const html = renderToStaticMarkup(<ShippingFootnote simulated />)
    expect(html).toContain('Loja de demonstração: o frete é simulado, com valor e prazo fictícios.')
    expect(html).toContain('nenhum produto será enviado')
    expect(html).not.toContain('reconfirmado com a transportadora')
  })

  it('frete real mantém o texto de reconfirmação', () => {
    const html = renderToStaticMarkup(<ShippingFootnote simulated={false} />)
    expect(html).toContain('reconfirmado com a transportadora')
    expect(html).not.toContain('simulado')
  })
})

describe('OrderSummary', () => {
  const base = { subtotalCents: 10000, discountCents: 0, shippingCents: 1990, totalCents: 11990 }

  it('rotula "Frete (simulado)" quando o frete escolhido é o demonstrativo', () => {
    expect(renderToStaticMarkup(<OrderSummary {...base} shippingSimulated />)).toContain(
      'Frete (simulado)',
    )
  })

  it('rótulo padrão "Frete" no frete real', () => {
    const html = renderToStaticMarkup(<OrderSummary {...base} />)
    expect(html).toContain('>Frete<')
    expect(html).not.toContain('simulado')
  })
})
