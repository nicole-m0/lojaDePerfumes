import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('server-only', () => ({}))

interface ProductRow {
  id: string
  status: string
  featured: boolean
  orderItems: number
  stockMovements: number
}

const h = vi.hoisted(() => ({
  products: [] as ProductRow[],
  deleteError: null as unknown,
  deleted: [] as string[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      async findUnique({ where }: { where: { id: string } }) {
        const p = h.products.find((x) => x.id === where.id)
        if (!p) return null
        return {
          id: p.id,
          _count: { orderItems: p.orderItems, stockMovements: p.stockMovements },
        }
      },
      async update({ where, data }: { where: { id: string }; data: Partial<ProductRow> }) {
        const p = h.products.find((x) => x.id === where.id)
        if (!p) throw new Error('not found')
        Object.assign(p, data)
        return { ...p }
      },
      async delete({ where }: { where: { id: string } }) {
        if (h.deleteError) throw h.deleteError
        const i = h.products.findIndex((x) => x.id === where.id)
        if (i === -1) throw new Error('not found')
        h.deleted.push(where.id)
        h.products.splice(i, 1)
        return { id: where.id }
      },
    },
  },
}))

import { removeProduct } from './product-removal'

function product(id: string, links: Partial<ProductRow> = {}): ProductRow {
  return { id, status: 'ACTIVE', featured: true, orderItems: 0, stockMovements: 0, ...links }
}

beforeEach(() => {
  h.products = []
  h.deleteError = null
  h.deleted = []
})

describe('removeProduct', () => {
  it('exclui de fato um produto sem pedidos nem movimentações', async () => {
    h.products.push(product('p1'))
    expect(await removeProduct('p1')).toBe('deleted')
    expect(h.deleted).toEqual(['p1'])
    expect(h.products).toHaveLength(0)
  })

  it('arquiva (não apaga) um produto com pedidos vinculados', async () => {
    h.products.push(product('p1', { orderItems: 2 }))
    expect(await removeProduct('p1')).toBe('archived')
    expect(h.deleted).toEqual([])
    expect(h.products[0]).toMatchObject({ status: 'ARCHIVED', featured: false })
  })

  it('arquiva um produto com movimentações de estoque (preserva o livro-razão)', async () => {
    h.products.push(product('p1', { stockMovements: 1 }))
    expect(await removeProduct('p1')).toBe('archived')
    expect(h.deleted).toEqual([])
    expect(h.products[0].status).toBe('ARCHIVED')
  })

  it('produto inexistente → not_found, sem lançar', async () => {
    expect(await removeProduct('nao-existe')).toBe('not_found')
  })

  it('corrida: FK barra o DELETE (P2003) → arquiva em vez de erro 500', async () => {
    h.products.push(product('p1'))
    h.deleteError = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: 'test',
    })
    expect(await removeProduct('p1')).toBe('archived')
    expect(h.products[0].status).toBe('ARCHIVED')
  })

  it('outros erros do banco não são mascarados', async () => {
    h.products.push(product('p1'))
    h.deleteError = new Error('conexão perdida')
    await expect(removeProduct('p1')).rejects.toThrow('conexão perdida')
  })
})
