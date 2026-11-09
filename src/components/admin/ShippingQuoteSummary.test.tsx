import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ShippingQuoteSummary, { type ShippingQuoteSummaryValue } from './ShippingQuoteSummary'

// Identificação visual do frete simulado na página do pedido no painel (Etapa D1).

const formatDate = () => '06/11/2026 10:00'

const demoQuote: ShippingQuoteSummaryValue = {
  provider: 'demo',
  serviceName: 'Frete simulado',
  carrier: 'Demonstração',
  priceCents: 1990,
  deliveryDaysMin: 5,
  deliveryDaysMax: 8,
  quotedAt: new Date('2026-11-06T13:00:00Z'),
  originZip: '',
  destZip: '20010000',
}

const realQuote: ShippingQuoteSummaryValue = {
  ...demoQuote,
  provider: 'melhorenvio',
  serviceName: 'PAC',
  carrier: 'Correios',
  priceCents: 2340,
  deliveryDaysMin: 6,
  deliveryDaysMax: 8,
  originZip: '01001000',
}

const norm = (html: string) => html.replace(/<!-- -->/g, '')

describe('ShippingQuoteSummary', () => {
  it('provider "demo": selo, aviso e valor/prazo marcados como fictícios', () => {
    const html = norm(renderToStaticMarkup(<ShippingQuoteSummary quote={demoQuote} formatDate={formatDate} />))

    expect(html).toContain('Frete simulado</span>') // selo
    expect(html).toContain('Frete simulado (modo demonstração): valor e prazo fictícios')
    expect(html).toContain('Este pedido não tem envio real.')
    expect(html).toContain('R$')
    expect(html).toMatch(/19,90 \(fictício\)/)
    expect(html).toContain('5–8 dias úteis (fictício)')
    expect(html).not.toContain('Demonstração ·')
    // Sem CEP de origem configurado, mostra traço.
    expect(html).toContain('— → 20010000')
  })

  it('provider "melhorenvio": sem selo nem aviso, transportadora · serviço', () => {
    const html = norm(renderToStaticMarkup(<ShippingQuoteSummary quote={realQuote} formatDate={formatDate} />))

    expect(html).toContain('Correios · PAC')
    expect(html).toContain('6–8 dias úteis')
    expect(html).toContain('01001000 → 20010000')
    expect(html).not.toContain('simulado')
    expect(html).not.toContain('fictício')
  })
})
