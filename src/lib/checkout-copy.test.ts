import { describe, expect, it } from 'vitest'
import { getConfirmationCopy, getReturnCopy } from './checkout-copy'

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

describe('getReturnCopy (Etapa D3)', () => {
  const order = (paymentStatus: string) => ({ number: 7, paymentStatus, totalCents: 10000 })
  const text = (c: { title: string; body: string; status: string }) =>
    `${c.status} ${c.title} ${c.body}`.toLowerCase()

  it.each(['pending', 'failure'] as const)('%s sem acesso: genérico, sem pedido, sem afirmar pagamento', (variant) => {
    const c = getReturnCopy({ variant, order: null })
    expect(c.showOrder).toBe(false)
    expect(text(c)).not.toContain('confirmado')
    expect(text(c)).toContain('link gerado no momento da compra')
  })

  it.each(['pending', 'failure'] as const)('%s com PENDING no banco nunca diz que foi pago', (variant) => {
    const c = getReturnCopy({ variant, order: order('PENDING') })
    expect(c.showOrder).toBe(true)
    expect(c.tone).not.toBe('success')
    expect(text(c)).not.toMatch(/pagamento confirmado|foi aprovado|pago com sucesso/)
  })

  it('falha + PENDING: avisa que tentar de novo cria um novo pedido', () => {
    const c = getReturnCopy({ variant: 'failure', order: order('PENDING') })
    expect(c.body).toContain('um novo pedido será criado')
    expect(c.cta.href).toBe('/carrinho')
  })

  it.each(['pending', 'failure'] as const)('%s com PAID no banco: confirmado, sem pedir para pagar de novo', (variant) => {
    const c = getReturnCopy({ variant, order: order('PAID') })
    expect(c.tone).toBe('success')
    expect(c.title).toBe('Pagamento confirmado')
    expect(c.cta.href).toBe('/')
  })

  it.each(['PARTIALLY_PAID', 'REFUNDED', 'CHARGEBACK'])('%s: texto neutro de revisão', (status) => {
    const c = getReturnCopy({ variant: 'pending', order: order(status) })
    expect(c.tone).toBe('pending')
    expect(text(c)).toContain('revisão')
    expect(text(c)).not.toContain('confirmado')
  })
})
