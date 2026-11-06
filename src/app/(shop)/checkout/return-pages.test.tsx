import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Páginas de retorno /checkout/pendente e /checkout/falha (Etapa D3): renderiza as
// páginas reais, com o token HMAC real (src/lib/order-access.ts via
// getOrderConfirmation) e um banco simulado. Garante que o redirecionamento do
// Mercado Pago não "confirma" nada, que token inválido não mostra dados e que
// nenhum dado pessoal aparece.

vi.mock('server-only', () => ({}))

interface OrderRow {
  id: string
  number: number
  paymentStatus: string
  totalCents: number
  customerName: string
  customerEmail: string
  customerPhone: string
}

const h = vi.hoisted(() => ({ orders: [] as OrderRow[], queries: 0 }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      async findUnique({ where, select }: { where: { number: number }; select: Record<string, boolean> }) {
        h.queries++
        const row = h.orders.find((o) => o.number === where.number)
        if (!row) return null
        return Object.fromEntries(Object.entries(row).filter(([k]) => select[k]))
      },
    },
  },
}))

import PendingPage from './pendente/page'
import FailurePage from './falha/page'
import { issueOrderAccessToken } from '@/server/orders'

const ORIG = { ...process.env }

beforeEach(() => {
  process.env.AUTH_SECRET = 'segredo-de-teste-com-tamanho-suficiente-123'
  h.queries = 0
  h.orders = [
    { id: 'ord_a', number: 1, paymentStatus: 'PENDING', totalCents: 15990, customerName: 'Cliente A', customerEmail: 'a@example.com', customerPhone: '11999990000' },
    { id: 'ord_b', number: 2, paymentStatus: 'PAID', totalCents: 9990, customerName: 'Cliente B', customerEmail: 'b@example.com', customerPhone: '11999990001' },
    { id: 'ord_c', number: 3, paymentStatus: 'REFUNDED', totalCents: 5000, customerName: 'Cliente C', customerEmail: 'c@example.com', customerPhone: '11999990002' },
  ]
})
afterEach(() => {
  process.env = { ...ORIG }
})

type Page = typeof PendingPage
async function render(page: Page, params: Record<string, string | string[] | undefined>) {
  const el = await page({ searchParams: Promise.resolve(params) })
  return renderToStaticMarkup(el).replace(/<!-- -->/g, '')
}
const tokenFor = (id: string) => issueOrderAccessToken(id)

function expectNoPersonalData(html: string) {
  for (const o of h.orders) {
    expect(html).not.toContain(o.customerName)
    expect(html).not.toContain(o.customerEmail)
    expect(html).not.toContain(o.customerPhone)
    expect(html).not.toContain(o.id)
  }
}

describe('retorno do navegador sem pagamento confirmado', () => {
  // O Mercado Pago acrescenta parâmetros próprios na volta. Mesmo dizendo
  // "approved", eles não valem: o banco ainda registra PENDING.
  const mpParams = { status: 'approved', collection_status: 'approved', payment_id: '123', external_reference: 'ord_a' }

  it('pendente: mostra "aguardando", com número e total, sem dizer que foi pago', async () => {
    const html = await render(PendingPage, { pedido: '1', token: tokenFor('ord_a'), ...mpParams })
    expect(html).toContain('Estamos aguardando o pagamento')
    expect(html).toContain('Pedido nº 1')
    expect(html).toMatch(/159,90/)
    expect(html).not.toMatch(/Pagamento confirmado/i)
    expectNoPersonalData(html)
  })

  it('falha: mostra "não foi finalizado", pedido continua aguardando pagamento', async () => {
    const html = await render(FailurePage, { pedido: '1', token: tokenFor('ord_a'), ...mpParams })
    expect(html).toContain('O pagamento não foi finalizado')
    expect(html).toContain('Pedido nº 1')
    expect(html).toContain('aguardando pagamento')
    expect(html).toContain('href="/carrinho"')
    expect(html).not.toMatch(/Pagamento confirmado/i)
    expectNoPersonalData(html)
  })
})

describe('estado real do pedido vem do banco', () => {
  it('falha com pedido já PAID no banco: mostra pagamento confirmado (não pede para pagar de novo)', async () => {
    const html = await render(FailurePage, { pedido: '2', token: tokenFor('ord_b'), status: 'rejected' })
    expect(html).toContain('Pagamento confirmado')
    expect(html).toContain('Não é preciso pagar de novo')
    expect(html).not.toContain('href="/carrinho"')
  })

  it('pendente com pedido estornado: texto neutro de revisão', async () => {
    const html = await render(PendingPage, { pedido: '3', token: tokenFor('ord_c') })
    expect(html).toContain('está em revisão')
    expect(html).toContain('Pedido nº 3')
    expect(html).not.toMatch(/Pagamento confirmado/i)
  })
})

describe('token HMAC inválido ou adulterado não mostra dados', () => {
  function flip(token: string): string {
    const last = token.at(-1) === 'A' ? 'B' : 'A'
    return token.slice(0, -1) + last
  }

  type Mutate = (token: string) => string | string[] | undefined
  const cases: [string, Mutate][] = [
    ['sem token', () => undefined],
    ['token adulterado', flip],
    ['token truncado', (t) => t.slice(0, 20)],
    ['token com caracteres inválidos', (t) => `${t.slice(0, 31)}!`],
    ['token repetido na URL (array)', (t) => [t, t]],
  ]

  it.each(cases)('%s → mensagem genérica, sem número nem total', async (_name, mutate) => {
    for (const page of [PendingPage, FailurePage]) {
      const html = await render(page, { pedido: '1', token: mutate(tokenFor('ord_a')) })
      expect(html).not.toContain('Pedido nº')
      expect(html).not.toMatch(/159,90/)
      expect(html).toContain('link gerado no momento da compra')
      expectNoPersonalData(html)
    }
  })

  it('token de outro pedido não revela este (trocar o número na URL)', async () => {
    const html = await render(PendingPage, { pedido: '2', token: tokenFor('ord_a') })
    expect(html).not.toContain('Pedido nº')
    expect(html).not.toMatch(/99,90/)
  })

  it('token assinado com outro segredo não vale', async () => {
    const token = tokenFor('ord_a')
    process.env.AUTH_SECRET = 'outro-segredo-de-teste-com-tamanho-suficiente'
    const html = await render(PendingPage, { pedido: '1', token })
    expect(html).not.toContain('Pedido nº')
  })

  it('sem AUTH_SECRET configurado: falha fechada, sem dados', async () => {
    const token = tokenFor('ord_a')
    delete process.env.AUTH_SECRET
    const html = await render(FailurePage, { pedido: '1', token })
    expect(html).not.toContain('Pedido nº')
  })
})

describe('parâmetro pedido malformado', () => {
  it.each([undefined, '', '0', '-1', '1e0', '0x1', ' 1', '01', '1.0', 'abc', '99999999999', ['1', '2']])(
    'pedido=%j → genérico e o banco nem é consultado',
    async (pedido) => {
      const html = await render(PendingPage, { pedido: pedido as string, token: tokenFor('ord_a') })
      expect(html).not.toContain('Pedido nº')
      expect(h.queries).toBe(0)
    },
  )

  it('pedido inexistente com token qualquer → genérico (mesma resposta)', async () => {
    const html = await render(FailurePage, { pedido: '999', token: tokenFor('ord_a') })
    expect(html).not.toContain('Pedido nº')
    expect(html).toContain('Não foi possível confirmar o pagamento')
  })
})
