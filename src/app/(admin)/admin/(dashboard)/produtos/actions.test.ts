import { beforeEach, describe, expect, it, vi } from 'vitest'

// saveProduct: o custo só é gravado por quem tem `productCost` (OWNER/ADMIN).
// Para STAFF, o custo enviado é descartado antes de qualquer validação: na edição o
// valor salvo é preservado; na criação o produto nasce sem custo.

const h = vi.hoisted(() => ({
  role: 'STAFF' as string,
  update: vi.fn(),
  create: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/server/guard', () => ({
  requireStaff: async () => ({ id: 'u1', email: 'u1@x.dev', name: null, role: h.role }),
}))
vi.mock('@/server/stock', () => ({ registerManualEntry: vi.fn() }))
vi.mock('@/server/product-removal', () => ({ removeProduct: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: async () => null, // slug livre
      update: h.update,
      create: h.create,
    },
    productSpec: { deleteMany: () => ({}), createMany: () => ({}) },
    productImage: { deleteMany: () => ({}), createMany: () => ({}) },
    $transaction: async (ops: unknown[]) => ops,
  },
}))

import { saveProduct } from '@/app/(admin)/admin/(dashboard)/produtos/actions'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  const base = {
    name: 'Perfume Teste',
    description: 'Descrição',
    categoryId: 'cat1',
    brandId: 'brand1',
    priceReais: '100,00',
    status: 'ACTIVE',
    specs: '[]',
    images: '[]',
  }
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v)
  return fd
}

beforeEach(() => {
  h.update.mockReset()
  h.create.mockReset()
  h.update.mockResolvedValue({ id: 'prod1' })
  h.create.mockResolvedValue({ id: 'prod1' })
})

const save = (fields: Record<string, string>) => saveProduct({}, form(fields))

describe('saveProduct — custo do produto', () => {
  it('STAFF editando: custo enviado é ignorado e o campo nem entra no update (valor salvo preservado)', async () => {
    h.role = 'STAFF'
    await expect(save({ id: 'prod1', costReais: '50,00' })).rejects.toThrow('REDIRECT:/admin/produtos')
    const data = h.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('costCents')
    expect(data.priceCents).toBe(10000)
  })

  it('STAFF criando: produto nasce sem custo, mesmo enviando um valor', async () => {
    h.role = 'STAFF'
    await expect(save({ costReais: '50,00' })).rejects.toThrow('REDIRECT:/admin/produtos')
    expect(h.create.mock.calls[0][0].data.costCents).toBeNull()
  })

  it('STAFF enviando custo inválido: descartado sem erro e sem gravar custo', async () => {
    h.role = 'STAFF'
    await expect(save({ id: 'prod1', costReais: '-5' })).rejects.toThrow('REDIRECT:/admin/produtos')
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty('costCents')
  })

  it.each(['OWNER', 'ADMIN'])('%s grava o custo', async (role) => {
    h.role = role
    await expect(save({ id: 'prod1', costReais: '50,00' })).rejects.toThrow('REDIRECT:/admin/produtos')
    expect(h.update.mock.calls[0][0].data.costCents).toBe(5000)
  })

  it('ADMIN com custo vazio grava null ("não informado"), nunca 0', async () => {
    h.role = 'ADMIN'
    await expect(save({ id: 'prod1', costReais: '' })).rejects.toThrow('REDIRECT:/admin/produtos')
    expect(h.update.mock.calls[0][0].data.costCents).toBeNull()
  })

  it('ADMIN com custo inválido recebe erro e nada é gravado', async () => {
    h.role = 'ADMIN'
    await expect(save({ id: 'prod1', costReais: '-5' })).resolves.toEqual({ error: 'Custo inválido.' })
    expect(h.update).not.toHaveBeenCalled()
  })
})
