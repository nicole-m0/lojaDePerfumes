import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Segurança da página pública de confirmação: trocar o número na URL não pode
// revelar dados de pedidos de terceiros.

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
      async findUnique({
        where,
        select,
      }: {
        where: { number: number }
        select: Record<string, boolean>
      }) {
        h.queries++
        const row = h.orders.find((o) => o.number === where.number)
        if (!row) return null
        // Respeita o `select` como o Prisma faz.
        return Object.fromEntries(
          Object.entries(row).filter(([k]) => select[k]),
        ) as Partial<OrderRow>
      },
    },
  },
}))

import { getOrderConfirmation, issueOrderAccessToken } from './orders'

const ORIG = { ...process.env }

beforeEach(() => {
  process.env.AUTH_SECRET = 'segredo-de-teste-com-tamanho-suficiente-123'
  h.queries = 0
  h.orders = [
    {
      id: 'ord_a',
      number: 1,
      paymentStatus: 'PENDING',
      totalCents: 15990,
      customerName: 'Cliente A',
      customerEmail: 'a@example.com',
      customerPhone: '11999990000',
    },
    {
      id: 'ord_b',
      number: 2,
      paymentStatus: 'PAID',
      totalCents: 9990,
      customerName: 'Cliente B',
      customerEmail: 'b@example.com',
      customerPhone: '11999990001',
    },
  ]
})

afterEach(() => {
  process.env = { ...ORIG }
})

describe('getOrderConfirmation', () => {
  it('com token válido devolve só número, status de pagamento e total', async () => {
    const token = issueOrderAccessToken('ord_a')
    const result = await getOrderConfirmation(1, token)
    expect(result).toEqual({ number: 1, paymentStatus: 'PENDING', totalCents: 15990 })
    // Nenhum dado pessoal nem o id interno.
    expect(Object.keys(result!).sort()).toEqual(['number', 'paymentStatus', 'totalCents'])
  })

  it('trocar o número na URL (mesmo token) não revela outro pedido', async () => {
    const tokenA = issueOrderAccessToken('ord_a')
    expect(await getOrderConfirmation(2, tokenA)).toBeNull()
  })

  it('sem token devolve null e nem consulta o banco', async () => {
    expect(await getOrderConfirmation(1, undefined)).toBeNull()
    expect(await getOrderConfirmation(1, '')).toBeNull()
    expect(h.queries).toBe(0)
  })

  it('token inválido ou adulterado devolve null', async () => {
    expect(await getOrderConfirmation(1, 'x'.repeat(32))).toBeNull()
    expect(await getOrderConfirmation(1, '1')).toBeNull()
  })

  it('pedido inexistente e número inválido devolvem null (mesma resposta)', async () => {
    const token = issueOrderAccessToken('ord_a')
    expect(await getOrderConfirmation(999, token)).toBeNull()
    expect(await getOrderConfirmation(0, token)).toBeNull()
    expect(await getOrderConfirmation(-1, token)).toBeNull()
    expect(await getOrderConfirmation(1.5, token)).toBeNull()
  })

  it('sem AUTH_SECRET falha fechado (null), mesmo com token antes válido', async () => {
    const token = issueOrderAccessToken('ord_a')
    delete process.env.AUTH_SECRET
    expect(await getOrderConfirmation(1, token)).toBeNull()
    expect(() => issueOrderAccessToken('ord_a')).toThrow()
  })
})
