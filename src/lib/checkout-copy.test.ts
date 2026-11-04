import { describe, expect, it } from 'vitest'
import { getConfirmationCopy } from './checkout-copy'

const allText = (c: { title: string; body: string; footnote: string }) =>
  `${c.title} ${c.body} ${c.footnote}`.toLowerCase()

describe('getConfirmationCopy', () => {
  it('sem acesso ao pedido: mensagem genérica, sem dados', () => {
    const c = getConfirmationCopy({ order: null, onlinePayment: true })
    expect(c.tone).toBe('pending')
    expect(allText(c)).not.toContain('confirmado')
    expect(allText(c)).not.toMatch(/#\d/)
  })

  it('pagamento pendente não promete confirmação, preparação nem baixa de estoque', () => {
    for (const onlinePayment of [true, false]) {
      const c = getConfirmationCopy({
        order: { number: 5, paymentStatus: 'PENDING', totalCents: 1000 },
        onlinePayment,
      })
      const text = allText(c)
      expect(c.tone).toBe('pending')
      expect(text).not.toContain('confirmado')
      expect(text).not.toContain('automaticamente')
      expect(text).not.toContain('preparação')
      expect(text).not.toContain('estoque')
      expect(text).toContain('aguardando')
    }
  })

  it('sem Mercado Pago não fala em confirmação pelo Mercado Pago', () => {
    const c = getConfirmationCopy({
      order: { number: 5, paymentStatus: 'PENDING', totalCents: 1000 },
      onlinePayment: false,
    })
    expect(allText(c)).not.toContain('mercado pago')
  })

  it('só diz "pagamento confirmado" quando o banco já registra PAID', () => {
    const paid = getConfirmationCopy({
      order: { number: 5, paymentStatus: 'PAID', totalCents: 1000 },
      onlinePayment: true,
    })
    expect(paid.tone).toBe('paid')
    expect(paid.title).toBe('Pagamento confirmado')

    for (const status of ['PARTIALLY_PAID', 'FAILED', 'REFUNDED']) {
      const c = getConfirmationCopy({
        order: { number: 5, paymentStatus: status, totalCents: 1000 },
        onlinePayment: true,
      })
      expect(c.tone).toBe('pending')
    }
  })
})
