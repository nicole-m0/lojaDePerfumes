/**
 * Seed do banco de DEMONSTRAÇÃO (Etapa C). Chamado somente por `run()` em
 * `src/lib/demo-db/cli.ts` (via `npm run db:seed` → `scripts/demo-db.ts seed`),
 * DEPOIS da validação do destino (`target.ts`) e da proteção de isolamento
 * (`guard.ts`) confirmar que o banco é a demo do alvo pedido. Não execute diretamente.
 *
 * Regra única: CRIA SÓ O QUE NÃO EXISTE e NUNCA altera um registro existente — o
 * que já está no banco (inclusive edições feitas no painel) prevalece. Pode rodar de
 * novo quantas vezes for preciso: só completa o que falta.
 * - admin: se o e-mail já existe, não mexe (não promove, não reativa, não troca nome
 *   nem senha); senão cria como OWNER;
 * - categorias e marcas: reaproveita a existente (pelo slug, depois pelo nome) sem
 *   alterar; senão cria;
 * - produtos: se o slug já existe, pula por completo (dados, status — inclusive
 *   arquivado —, especificações, imagens e estoque intactos); senão cria, numa ÚNICA
 *   transação, produto + especificações + imagens + entrada de estoque inicial
 *   (INBOUND/PURCHASE) com o saldo correspondente;
 * - conflito de unicidade (outra execução criou o registro ao mesmo tempo): a
 *   transação inteira é desfeita e o registro passa a contar como existente — sem
 *   estoque em dobro;
 * - avaliações sempre zeradas (sem notas/contagens inventadas).
 */
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { DEMO_BRANDS, DEMO_CATEGORIES, DEMO_PRODUCTS, type DemoProduct } from '@/data/demo-catalog'

export const INITIAL_STOCK_NOTE = 'Estoque inicial — demonstração'

export interface DemoAdminInput {
  email: string
  password: string
  name: string
}

export interface CreatedExisting {
  created: number
  existing: number
}

export interface SeedSummary {
  admin: { email: string; created: boolean }
  categories: CreatedExisting
  brands: CreatedExisting
  products: CreatedExisting
  stockInitialized: number
}

/** Violação de unicidade do Prisma (P2002), sem importar o runtime do Prisma. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

const PLACEHOLDER_PASSWORDS = new Set(['troque-esta-senha', 'admin', 'password', '123456'])

/**
 * Recebe as variáveis já filtradas por `resolveDemoAdminVars` (do PRÓPRIO
 * `.env.local`), nunca o `process.env` — que o Prisma completa com o `.env` antigo
 * (admin do painel antigo). Aqui só se confere o formato.
 */
export function readDemoAdmin(env: Readonly<Record<string, string | undefined>>): DemoAdminInput {
  const email = env.ADMIN_EMAIL?.trim()
  const password = env.ADMIN_PASSWORD ?? ''
  const name = env.ADMIN_NAME?.trim() || 'Administração'
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL ausente ou inválido.')
  }
  if (password.length < 10 || PLACEHOLDER_PASSWORDS.has(password)) {
    throw new Error('ADMIN_PASSWORD ausente, curta (< 10) ou com valor de exemplo.')
  }
  return { email, password, name }
}

function productData(p: DemoProduct, categoryId: string, brandId: string) {
  return {
    name: p.name,
    description: p.description,
    status: 'ACTIVE' as const,
    featured: p.featured ?? false,
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents ?? null,
    costCents: p.costCents,
    weightGrams: p.weightGrams,
    heightCm: p.heightCm,
    widthCm: p.widthCm,
    lengthCm: p.lengthCm,
    ratingAvg: 0,
    ratingCount: 0,
    iconKey: null,
    gradient: null,
    categoryId,
    brandId,
  }
}

/**
 * Admin da demonstração: cria se o e-mail não existir; se existir, NÃO altera nada.
 * Conflito de unicidade (criado ao mesmo tempo por outra execução) → usa o existente.
 */
async function ensureAdmin(prisma: PrismaClient, admin: DemoAdminInput): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { email: admin.email }, select: { id: true } })
  if (existing) return { id: existing.id, created: false }
  const passwordHash = await bcrypt.hash(admin.password, 10)
  try {
    const row = await prisma.user.create({
      data: { email: admin.email, name: admin.name, passwordHash, role: 'OWNER' },
      select: { id: true },
    })
    return { id: row.id, created: true }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const row = await prisma.user.findUnique({ where: { email: admin.email }, select: { id: true } })
    if (!row) throw e
    return { id: row.id, created: false }
  }
}

type Taxonomy = 'category' | 'brand'

/**
 * Categoria/marca: reaproveita a existente — pelo slug e, se não houver, pelo nome
 * (ambos únicos; o admin pode ter criado uma com o mesmo nome e outro slug) — SEM
 * alterar; senão cria. Conflito de unicidade → relê e reaproveita.
 */
async function ensureTaxonomy(
  prisma: PrismaClient,
  kind: Taxonomy,
  item: { name: string; slug: string },
  position: number,
): Promise<{ id: string; created: boolean }> {
  // `category` e `brand` têm a mesma forma (id, name @unique, slug @unique, position).
  const model = prisma[kind] as unknown as PrismaClient['category']
  const find = async () =>
    (await model.findUnique({ where: { slug: item.slug }, select: { id: true } })) ??
    (await model.findUnique({ where: { name: item.name }, select: { id: true } }))

  const existing = await find()
  if (existing) return { id: existing.id, created: false }
  try {
    const row = await model.create({ data: { name: item.name, slug: item.slug, position }, select: { id: true } })
    return { id: row.id, created: true }
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const row = await find()
    if (!row) throw e
    return { id: row.id, created: false }
  }
}

/**
 * Produto: se o slug existe, não toca em nada. Senão cria, numa ÚNICA transação,
 * produto + especificações + imagens + entrada de estoque inicial (com o saldo).
 * Qualquer falha desfaz a transação inteira. Conflito de unicidade só conta como
 * "já existente" se, relendo pelo slug, o produto existir (outra execução o criou) —
 * a movimentação de estoque fica só com quem o criou; senão o erro é relançado.
 */
async function ensureProduct(
  prisma: PrismaClient,
  p: DemoProduct,
  categoryId: string,
  brandId: string,
  userId: string,
): Promise<'created' | 'existing'> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { slug: p.slug }, select: { id: true } })
      if (existing) return 'existing' as const

      const stock = Math.max(0, p.initialStock)
      const row = await tx.product.create({
        data: { slug: p.slug, ...productData(p, categoryId, brandId), stockOnHand: stock },
        select: { id: true },
      })
      if (p.specs.length) {
        await tx.productSpec.createMany({
          data: p.specs.map((s, position) => ({ productId: row.id, label: s.label, value: s.value, position })),
        })
      }
      if (p.images?.length) {
        await tx.productImage.createMany({
          data: p.images.map((img, position) => ({
            productId: row.id,
            url: img.url,
            publicId: img.publicId ?? null,
            alt: img.alt,
            position,
          })),
        })
      }
      if (stock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: row.id,
            type: 'INBOUND',
            reason: 'PURCHASE',
            quantity: stock,
            userId,
            note: INITIAL_STOCK_NOTE,
          },
        })
      }
      return 'created' as const
    })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // Só conta como "já existente" se o produto com ESTE slug existir de fato
    // (criado por outra execução); qualquer outra violação de unicidade é relançada.
    const row = await prisma.product.findUnique({ where: { slug: p.slug }, select: { id: true } })
    if (!row) throw e
    return 'existing'
  }
}

export async function seedDemo(
  prisma: PrismaClient,
  admin: DemoAdminInput,
  log: (msg: string) => void = console.log,
): Promise<SeedSummary> {
  // 1) Admin (nunca altera um usuário existente).
  const user = await ensureAdmin(prisma, admin)
  log(`[seed] admin ${admin.email}: ${user.created ? 'criado (OWNER)' : 'já existia — não alterado'}`)

  // 2) Categorias e marcas (nunca altera as existentes).
  const categories: CreatedExisting = { created: 0, existing: 0 }
  const categoryId = new Map<string, string>()
  for (const [position, c] of DEMO_CATEGORIES.entries()) {
    const r = await ensureTaxonomy(prisma, 'category', c, position)
    categoryId.set(c.name, r.id)
    categories[r.created ? 'created' : 'existing']++
  }
  const brands: CreatedExisting = { created: 0, existing: 0 }
  const brandId = new Map<string, string>()
  for (const [position, b] of DEMO_BRANDS.entries()) {
    const r = await ensureTaxonomy(prisma, 'brand', b, position)
    brandId.set(b.name, r.id)
    brands[r.created ? 'created' : 'existing']++
  }
  log(
    `[seed] categorias: ${categories.created} criadas, ${categories.existing} já existiam; ` +
      `marcas: ${brands.created} criadas, ${brands.existing} já existiam`,
  )

  // 3) Produtos (nunca altera os existentes), um por transação.
  const products: CreatedExisting = { created: 0, existing: 0 }
  let stockInitialized = 0
  for (const p of DEMO_PRODUCTS) {
    const cId = categoryId.get(p.category)
    const bId = brandId.get(p.brand)
    if (!cId || !bId) throw new Error(`Categoria/marca desconhecida em ${p.slug}`)

    const result = await ensureProduct(prisma, p, cId, bId, user.id)
    products[result]++
    if (result === 'created' && p.initialStock > 0) stockInitialized++
  }
  log(
    `[seed] produtos: ${products.created} criados, ${products.existing} já existiam (não alterados); ` +
      `estoque inicial em ${stockInitialized}`,
  )

  return { admin: { email: admin.email, created: user.created }, categories, brands, products, stockInitialized }
}
