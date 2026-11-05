import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { DEMO_PRODUCTS } from '@/data/demo-catalog'
import { INITIAL_STOCK_NOTE, readDemoAdmin, seedDemo } from './seed'

type Row = Record<string, unknown>

/** Fake em memória com o subconjunto do Prisma usado pelo seed. */
function makeFakeDb() {
  const t: Record<string, Row[]> = {
    user: [],
    category: [],
    brand: [],
    product: [],
    productSpec: [],
    productImage: [],
    stockMovement: [],
  }
  let seq = 0
  const id = () => `id_${++seq}`
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v)

  const model = (name: string) => ({
    async findUnique({ where }: { where: Row }) {
      return t[name].find((r) => match(r, where)) ?? null
    },
    async create({ data }: { data: Row }) {
      const row = { id: id(), ...data }
      t[name].push(row)
      return row
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const row = t[name].find((r) => match(r, where))
      if (!row) throw new Error(`${name} não encontrado`)
      Object.assign(row, data)
      return row
    },
    async upsert({ where, update, create }: { where: Row; update: Row; create: Row }) {
      const row = t[name].find((r) => match(r, where))
      if (row) return Object.assign(row, update)
      const created = { id: id(), ...create }
      t[name].push(created)
      return created
    },
    async deleteMany({ where }: { where: Row }) {
      const before = t[name].length
      t[name] = t[name].filter((r) => !match(r, where))
      return { count: before - t[name].length }
    },
    async createMany({ data }: { data: Row[] }) {
      for (const d of data) t[name].push({ id: id(), ...d })
      return { count: data.length }
    },
    async count({ where }: { where: Row }) {
      return t[name].filter((r) => match(r, where)).length
    },
  })

  const client = {
    user: model('user'),
    category: model('category'),
    brand: model('brand'),
    product: model('product'),
    productSpec: model('productSpec'),
    productImage: model('productImage'),
    stockMovement: model('stockMovement'),
    async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn(client)
    },
  }
  return { client, tables: t }
}

const ADMIN = { email: 'demo@bellacheirosa.test', password: 'senha-demo-segura-123', name: 'Demo' }
const quiet = () => {}

describe('readDemoAdmin', () => {
  it('exige e-mail válido e senha forte (não aceita o valor de exemplo)', () => {
    expect(readDemoAdmin({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: '0123456789' } as never)).toMatchObject({
      email: 'a@b.co',
      name: 'Administração',
    })
    expect(() => readDemoAdmin({ ADMIN_PASSWORD: '0123456789' } as never)).toThrow(/ADMIN_EMAIL/)
    expect(() => readDemoAdmin({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'curta' } as never)).toThrow(/ADMIN_PASSWORD/)
    expect(() =>
      readDemoAdmin({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'troque-esta-senha' } as never),
    ).toThrow(/ADMIN_PASSWORD/)
  })
})

describe('seedDemo', () => {
  it('cria admin, 6 categorias, 6 marcas, 32 produtos, specs e estoque inicial pelo livro-razão', async () => {
    const { client, tables } = makeFakeDb()
    const summary = await seedDemo(client as never, ADMIN, quiet)

    expect(summary).toMatchObject({ categories: 6, brands: 6, products: { created: 32, updated: 0 } })
    expect(tables.user).toHaveLength(1)
    expect(tables.user[0]).toMatchObject({ email: ADMIN.email, role: 'OWNER' })
    expect(await bcrypt.compare(ADMIN.password, tables.user[0].passwordHash as string)).toBe(true)
    expect(tables.category).toHaveLength(6)
    expect(tables.brand).toHaveLength(6)
    expect(tables.product).toHaveLength(32)
    expect(tables.productSpec).toHaveLength(DEMO_PRODUCTS.reduce((n, p) => n + p.specs.length, 0))

    for (const p of tables.product) {
      expect(p).toMatchObject({ status: 'ACTIVE', ratingAvg: 0, ratingCount: 0, iconKey: null, gradient: null })
    }

    // Estoque: uma entrada por produto com saldo inicial > 0; saldo = entrada.
    const withStock = DEMO_PRODUCTS.filter((p) => p.initialStock > 0)
    expect(summary.stockInitialized).toBe(withStock.length)
    expect(tables.stockMovement).toHaveLength(withStock.length)
    for (const demo of DEMO_PRODUCTS) {
      const row = tables.product.find((r) => r.slug === demo.slug)!
      expect(row.stockOnHand ?? 0, demo.slug).toBe(demo.initialStock)
      const moves = tables.stockMovement.filter((m) => m.productId === row.id)
      if (demo.initialStock > 0) {
        expect(moves).toEqual([
          expect.objectContaining({
            type: 'INBOUND',
            reason: 'PURCHASE',
            quantity: demo.initialStock,
            note: INITIAL_STOCK_NOTE,
            userId: tables.user[0].id,
          }),
        ])
      } else {
        expect(moves).toHaveLength(0)
      }
    }
  })

  it('é idempotente: rodar de novo não duplica nada nem soma estoque', async () => {
    const { client, tables } = makeFakeDb()
    await seedDemo(client as never, ADMIN, quiet)
    const stockBefore = tables.product.map((p) => [p.slug, p.stockOnHand])

    const again = await seedDemo(client as never, ADMIN, quiet)
    expect(again.products).toEqual({ created: 0, updated: 32 })
    expect(again.stockInitialized).toBe(0)
    expect(tables.user).toHaveLength(1)
    expect(tables.category).toHaveLength(6)
    expect(tables.brand).toHaveLength(6)
    expect(tables.product).toHaveLength(32)
    expect(tables.productSpec).toHaveLength(DEMO_PRODUCTS.reduce((n, p) => n + p.specs.length, 0))
    expect(tables.stockMovement).toHaveLength(DEMO_PRODUCTS.filter((p) => p.initialStock > 0).length)
    expect(tables.product.map((p) => [p.slug, p.stockOnHand])).toEqual(stockBefore)
  })

  it('não altera saldo de produto que já teve movimentação (ex.: venda de teste)', async () => {
    const { client, tables } = makeFakeDb()
    await seedDemo(client as never, ADMIN, quiet)
    const row = tables.product.find((p) => p.slug === 'cais-norte-original-eau-de-toilette-100ml')!
    row.stockOnHand = 15
    tables.stockMovement.push({ id: 'sale', productId: row.id, type: 'OUTBOUND', quantity: 1 })

    await seedDemo(client as never, ADMIN, quiet)
    expect(row.stockOnHand).toBe(15)
  })

  it('não troca a senha de um admin já existente', async () => {
    const { client, tables } = makeFakeDb()
    await seedDemo(client as never, ADMIN, quiet)
    const hash = tables.user[0].passwordHash
    await seedDemo(client as never, { ...ADMIN, password: 'outra-senha-bem-longa' }, quiet)
    expect(tables.user[0].passwordHash).toBe(hash)
  })
})
