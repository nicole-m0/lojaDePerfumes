import { describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { DEMO_BRANDS, DEMO_CATEGORIES, DEMO_PRODUCTS } from '@/data/demo-catalog'
import { INITIAL_STOCK_NOTE, readDemoAdmin, seedDemo } from './seed'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

/** Campos únicos por tabela (como no schema) — `create` viola → erro P2002. */
const UNIQUE: Record<string, string[]> = {
  user: ['email'],
  category: ['slug', 'name'],
  brand: ['slug', 'name'],
  product: ['slug'],
}

class UniqueViolation extends Error {
  code = 'P2002'
}

/**
 * Fake em memória com o subconjunto do Prisma usado pelo seed, com:
 * - unicidade (P2002) como no banco;
 * - transação com rollback de verdade (snapshot restaurado em caso de erro);
 * - `hooks.beforeCreate(model, data)` para injetar falhas ou simular outra execução.
 */
function makeFakeDb() {
  let t: Tables = {
    user: [],
    category: [],
    brand: [],
    product: [],
    productSpec: [],
    productImage: [],
    stockMovement: [],
  }
  const hooks: { beforeCreate?: (model: string, data: Row) => void } = {}
  /** Gravações "de fora" (painel/outra execução) feitas durante uma transação. */
  let outside: { name: string; row: Row }[] | null = null
  let seq = 0
  const id = () => `id_${++seq}`
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v)

  const insert = (name: string, data: Row): Row => {
    for (const key of UNIQUE[name] ?? []) {
      if (t[name].some((r) => r[key] === data[key])) throw new UniqueViolation(`${name}.${key} duplicado`)
    }
    const row = { id: id(), ...data }
    t[name].push(row)
    return row
  }

  const model = (name: string) => ({
    async findUnique({ where }: { where: Row }) {
      return t[name].find((r) => match(r, where)) ?? null
    },
    async create({ data }: { data: Row }) {
      hooks.beforeCreate?.(name, data)
      return insert(name, data)
    },
    async createMany({ data }: { data: Row[] }) {
      for (const d of data) {
        hooks.beforeCreate?.(name, d)
        insert(name, d)
      }
      return { count: data.length }
    },
    // O seed não deve usar nenhum destes — se usar, o teste falha.
    async update() {
      throw new Error(`${name}.update não deveria ser chamado pelo seed`)
    },
    async upsert() {
      throw new Error(`${name}.upsert não deveria ser chamado pelo seed`)
    },
    async deleteMany() {
      throw new Error(`${name}.deleteMany não deveria ser chamado pelo seed`)
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
      const snapshot = structuredClone(t)
      outside = []
      try {
        return await fn(client)
      } catch (e) {
        // Rollback: desfaz só o que ESTA transação gravou; o que outra execução
        // gravou por fora (já confirmado) permanece, como num banco real.
        const keep = outside
        t = snapshot
        for (const { name, row } of keep) t[name].push(row)
        throw e
      } finally {
        outside = null
      }
    },
  }
  return {
    client,
    hooks,
    tables: () => t,
    /** Insere direto, fora de qualquer transação do seed (painel ou outra execução). */
    put: (name: string, data: Row) => {
      const row = insert(name, data)
      outside?.push({ name, row: structuredClone(row) })
      return row
    },
  }
}

const ADMIN = { email: 'demo@bellacheirosa.test', password: 'senha-demo-segura-123', name: 'Demo' }
const quiet = () => {}
const SPECS_TOTAL = DEMO_PRODUCTS.reduce((n, p) => n + p.specs.length, 0)
const WITH_STOCK = DEMO_PRODUCTS.filter((p) => p.initialStock > 0)

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

describe('seedDemo — primeira execução', () => {
  it('cria admin, 6 categorias, 6 marcas, 32 produtos, specs e estoque inicial pelo livro-razão', async () => {
    const db = makeFakeDb()
    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    const t = db.tables()

    expect(summary).toEqual({
      admin: { email: ADMIN.email, created: true },
      categories: { created: 6, existing: 0 },
      brands: { created: 6, existing: 0 },
      products: { created: 32, existing: 0 },
      stockInitialized: WITH_STOCK.length,
    })
    expect(t.user).toHaveLength(1)
    expect(t.user[0]).toMatchObject({ email: ADMIN.email, role: 'OWNER', name: ADMIN.name })
    expect(await bcrypt.compare(ADMIN.password, t.user[0].passwordHash as string)).toBe(true)
    expect(t.category).toHaveLength(6)
    expect(t.brand).toHaveLength(6)
    expect(t.product).toHaveLength(32)
    expect(t.productSpec).toHaveLength(SPECS_TOTAL)

    for (const p of t.product) {
      expect(p).toMatchObject({ status: 'ACTIVE', ratingAvg: 0, ratingCount: 0, iconKey: null, gradient: null })
    }

    // Estoque: uma entrada por produto com saldo inicial > 0; saldo = entrada.
    expect(t.stockMovement).toHaveLength(WITH_STOCK.length)
    for (const demo of DEMO_PRODUCTS) {
      const row = t.product.find((r) => r.slug === demo.slug)!
      expect(row.stockOnHand, demo.slug).toBe(demo.initialStock)
      const moves = t.stockMovement.filter((m) => m.productId === row.id)
      if (demo.initialStock > 0) {
        expect(moves).toEqual([
          expect.objectContaining({
            type: 'INBOUND',
            reason: 'PURCHASE',
            quantity: demo.initialStock,
            note: INITIAL_STOCK_NOTE,
            userId: t.user[0].id,
          }),
        ])
      } else {
        expect(moves).toHaveLength(0)
      }
    }
  })
})

describe('seedDemo — reexecução nunca altera dados existentes', () => {
  it('rodar de novo não muda NENHUM registro (e não usa update/upsert/deleteMany)', async () => {
    const db = makeFakeDb()
    await seedDemo(db.client as never, ADMIN, quiet)
    const before = structuredClone(db.tables())

    const again = await seedDemo(db.client as never, ADMIN, quiet)
    expect(again).toEqual({
      admin: { email: ADMIN.email, created: false },
      categories: { created: 0, existing: 6 },
      brands: { created: 0, existing: 6 },
      products: { created: 0, existing: 32 },
      stockInitialized: 0,
    })
    expect(db.tables()).toEqual(before)
  })

  it('preserva edições feitas no painel: produto, status arquivado, specs, imagens, estoque, categoria e marca', async () => {
    const db = makeFakeDb()
    await seedDemo(db.client as never, ADMIN, quiet)
    const t = db.tables()
    const product = t.product.find((p) => p.slug === DEMO_PRODUCTS[0].slug)!
    Object.assign(product, {
      name: 'Nome editado no painel',
      priceCents: 1,
      featured: !product.featured,
      status: 'ARCHIVED',
      stockOnHand: 3,
    })
    const spec = t.productSpec.find((s) => s.productId === product.id)!
    spec.value = 'valor editado'
    t.productImage.push({ id: 'img-admin', productId: product.id, url: 'https://exemplo.test/a.jpg', alt: 'a', position: 0 })
    t.stockMovement.push({ id: 'venda', productId: product.id, type: 'OUTBOUND', reason: 'SALE', quantity: 1 })
    const category = t.category.find((c) => c.slug === DEMO_CATEGORIES[0].slug)!
    category.name = 'Categoria renomeada'
    category.position = 99
    const brand = t.brand.find((b) => b.slug === DEMO_BRANDS[0].slug)!
    brand.name = 'Marca renomeada'
    const before = structuredClone(db.tables())

    await seedDemo(db.client as never, ADMIN, quiet)
    expect(db.tables()).toEqual(before)
    expect(db.tables().product.find((p) => p.id === product.id)).toMatchObject({ status: 'ARCHIVED', stockOnHand: 3 })
  })

  it('não promove, não reativa e não altera um usuário existente com o mesmo e-mail', async () => {
    const db = makeFakeDb()
    const existing = db.put('user', {
      email: ADMIN.email,
      name: 'Funcionária',
      role: 'STAFF',
      isActive: false,
      passwordHash: 'hash-antigo',
    })
    const before = structuredClone(existing)

    const summary = await seedDemo(db.client as never, { ...ADMIN, password: 'outra-senha-bem-longa' }, quiet)
    expect(summary.admin).toEqual({ email: ADMIN.email, created: false })
    expect(db.tables().user).toEqual([before])
    // As entradas de estoque ficam atribuídas ao usuário existente (só registro de autoria).
    expect(new Set(db.tables().stockMovement.map((m) => m.userId))).toEqual(new Set([existing.id]))
  })

  it('reaproveita categoria/marca criada no painel com o MESMO NOME e outro slug, sem alterá-la', async () => {
    const db = makeFakeDb()
    const cat = db.put('category', { name: DEMO_CATEGORIES[0].name, slug: 'slug-do-painel', position: 7 })
    const brand = db.put('brand', { name: DEMO_BRANDS[0].name, slug: 'marca-do-painel', position: 3 })

    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    expect(summary.categories).toEqual({ created: 5, existing: 1 })
    expect(summary.brands).toEqual({ created: 5, existing: 1 })
    const t = db.tables()
    expect(t.category.find((c) => c.id === cat.id)).toEqual(cat)
    expect(t.brand.find((b) => b.id === brand.id)).toEqual(brand)
    const firstCatProducts = DEMO_PRODUCTS.filter((p) => p.category === DEMO_CATEGORIES[0].name)
    for (const p of firstCatProducts) {
      expect(t.product.find((r) => r.slug === p.slug)!.categoryId).toBe(cat.id)
    }
  })

  it('produto com o mesmo slug criado no painel é deixado como está (sem specs nem estoque do catálogo)', async () => {
    const db = makeFakeDb()
    const demo = WITH_STOCK[0]
    const mine = db.put('product', { slug: demo.slug, name: 'Meu produto', status: 'DRAFT', stockOnHand: 0 })

    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    expect(summary.products).toEqual({ created: 31, existing: 1 })
    const t = db.tables()
    expect(t.product.find((p) => p.id === mine.id)).toEqual(mine)
    expect(t.productSpec.filter((s) => s.productId === mine.id)).toEqual([])
    expect(t.stockMovement.filter((m) => m.productId === mine.id)).toEqual([])
  })
})

describe('seedDemo — atomicidade e execução parcial', () => {
  it('falha no meio de um produto desfaz o produto inteiro (sem produto, specs ou estoque órfãos)', async () => {
    const db = makeFakeDb()
    const target = WITH_STOCK[3]
    db.hooks.beforeCreate = (model, data) => {
      // Falha ao gravar a movimentação de estoque do produto-alvo (último passo da transação).
      if (model === 'stockMovement' && data.quantity === target.initialStock) {
        const row = db.tables().product.find((p) => p.slug === target.slug)
        if (row && data.productId === row.id) throw new Error('falha simulada no banco')
      }
    }
    await expect(seedDemo(db.client as never, ADMIN, quiet)).rejects.toThrow(/falha simulada/)

    const t = db.tables()
    const index = DEMO_PRODUCTS.findIndex((p) => p.slug === target.slug)
    expect(t.product).toHaveLength(index) // os anteriores ficaram; o alvo e os seguintes não
    expect(t.product.some((p) => p.slug === target.slug)).toBe(false)
    const ids = new Set(t.product.map((p) => p.id))
    for (const s of t.productSpec) expect(ids.has(s.productId as string)).toBe(true)
    for (const m of t.stockMovement) expect(ids.has(m.productId as string)).toBe(true)
  })

  it('reexecutar depois de uma falha completa o que faltou, com exatamente uma entrada de estoque por produto', async () => {
    const db = makeFakeDb()
    let fail = true
    db.hooks.beforeCreate = (model) => {
      if (fail && model === 'productSpec' && db.tables().product.length === 10) throw new Error('queda simulada')
    }
    await expect(seedDemo(db.client as never, ADMIN, quiet)).rejects.toThrow(/queda simulada/)
    const createdBefore = db.tables().product.length

    fail = false
    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    expect(summary.products).toEqual({ created: 32 - createdBefore, existing: createdBefore })
    const t = db.tables()
    expect(t.product).toHaveLength(32)
    expect(t.productSpec).toHaveLength(SPECS_TOTAL)
    expect(t.stockMovement).toHaveLength(WITH_STOCK.length)
    for (const demo of WITH_STOCK) {
      const row = t.product.find((r) => r.slug === demo.slug)!
      expect(t.stockMovement.filter((m) => m.productId === row.id)).toHaveLength(1)
    }
  })
})

describe('seedDemo — conflitos de unicidade / execuções simultâneas', () => {
  it('outra execução cria o mesmo produto entre a checagem e o create: conta como existente, sem estoque em dobro', async () => {
    const db = makeFakeDb()
    const demo = WITH_STOCK[0]
    let raced = false
    db.hooks.beforeCreate = (model, data) => {
      if (!raced && model === 'product' && data.slug === demo.slug) {
        raced = true
        // "Outra execução" grava o produto e a entrada de estoque dela por fora desta transação.
        const other = db.put('product', { slug: demo.slug, name: demo.name, stockOnHand: demo.initialStock })
        db.put('stockMovement', { productId: other.id, type: 'INBOUND', quantity: demo.initialStock })
      }
    }
    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    expect(summary.products).toEqual({ created: 31, existing: 1 })

    const t = db.tables()
    const rows = t.product.filter((p) => p.slug === demo.slug)
    expect(rows).toHaveLength(1)
    expect(t.stockMovement.filter((m) => m.productId === rows[0].id)).toHaveLength(1)
    expect(t.product).toHaveLength(32)
  })

  it('conflito na criação de categoria e de admin: relê e reaproveita o registro da outra execução', async () => {
    const db = makeFakeDb()
    const raced = new Set<string>()
    db.hooks.beforeCreate = (model, data) => {
      if (model === 'category' && data.slug === DEMO_CATEGORIES[1].slug && !raced.has('cat')) {
        raced.add('cat')
        db.put('category', { name: DEMO_CATEGORIES[1].name, slug: DEMO_CATEGORIES[1].slug, position: 1 })
      }
      if (model === 'user' && !raced.has('user')) {
        raced.add('user')
        db.put('user', { email: ADMIN.email, name: 'Outra execução', role: 'OWNER', passwordHash: 'x' })
      }
    }
    const summary = await seedDemo(db.client as never, ADMIN, quiet)
    expect(summary.admin.created).toBe(false)
    expect(summary.categories).toEqual({ created: 5, existing: 1 })
    const t = db.tables()
    expect(t.user).toHaveLength(1)
    expect(t.user[0].name).toBe('Outra execução')
    expect(t.category).toHaveLength(6)
  })

  it('P2002 sem o registro correspondente existir é RELANÇADO (produto, categoria e admin)', async () => {
    // Violação de unicidade que não vem de outra execução ter criado o mesmo registro.
    const cases: [string, (model: string, data: Row) => boolean][] = [
      ['product', (m, d) => m === 'product' && d.slug === DEMO_PRODUCTS[5].slug],
      ['category', (m, d) => m === 'category' && d.slug === DEMO_CATEGORIES[2].slug],
      ['user', (m) => m === 'user'],
    ]
    for (const [label, when] of cases) {
      const db = makeFakeDb()
      db.hooks.beforeCreate = (model, data) => {
        if (when(model, data)) throw new UniqueViolation(`P2002 em outro campo (${label})`)
      }
      await expect(seedDemo(db.client as never, ADMIN, quiet), label).rejects.toThrow(/P2002 em outro campo/)
    }
    // E o produto não ficou registrado como "existente" por engano.
    const db = makeFakeDb()
    db.hooks.beforeCreate = (model, data) => {
      if (model === 'product' && data.slug === DEMO_PRODUCTS[5].slug) throw new UniqueViolation('outro campo')
    }
    await expect(seedDemo(db.client as never, ADMIN, quiet)).rejects.toThrow(/outro campo/)
    expect(db.tables().product.some((p) => p.slug === DEMO_PRODUCTS[5].slug)).toBe(false)
  })

  it('erros que não são de unicidade não são engolidos', async () => {
    const db = makeFakeDb()
    db.hooks.beforeCreate = (model) => {
      if (model === 'brand') throw new Error('conexão perdida')
    }
    await expect(seedDemo(db.client as never, ADMIN, quiet)).rejects.toThrow(/conexão perdida/)
  })
})
