/**
 * Seed do banco de DEMONSTRAÇÃO (Etapa C). Chamado somente por
 * `scripts/demo-db.ts seed`, DEPOIS da proteção de isolamento (`guard.ts`)
 * confirmar que o banco é a demo do alvo pedido. Não execute diretamente.
 *
 * Idempotente (pode rodar de novo):
 * - categorias, marcas e produtos: upsert por slug (dados do catálogo prevalecem);
 * - especificações: recriadas; imagens: recriadas só quando o catálogo as define;
 * - estoque inicial: lançado UMA vez por produto, como movimentação de entrada
 *   (INBOUND/PURCHASE) + saldo — se o produto já tem movimentações, não mexe.
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

export interface SeedSummary {
  admin: string
  categories: number
  brands: number
  products: { created: number; updated: number }
  stockInitialized: number
}

const PLACEHOLDER_PASSWORDS = new Set(['troque-esta-senha', 'admin', 'password', '123456'])

export function readDemoAdmin(env: NodeJS.ProcessEnv): DemoAdminInput {
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

export async function seedDemo(
  prisma: PrismaClient,
  admin: DemoAdminInput,
  log: (msg: string) => void = console.log,
): Promise<SeedSummary> {
  // 1) Usuário administrativo da demonstração (senha só é definida na criação).
  const passwordHash = await bcrypt.hash(admin.password, 10)
  const user = await prisma.user.upsert({
    where: { email: admin.email },
    update: { name: admin.name, role: 'OWNER', isActive: true },
    create: { email: admin.email, name: admin.name, passwordHash, role: 'OWNER' },
  })
  log(`[seed] admin: ${user.email} (OWNER)`)

  // 2) Categorias e marcas.
  const categoryId = new Map<string, string>()
  for (const [position, c] of DEMO_CATEGORIES.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, position },
      create: { name: c.name, slug: c.slug, position },
    })
    categoryId.set(c.name, row.id)
  }
  const brandId = new Map<string, string>()
  for (const [position, b] of DEMO_BRANDS.entries()) {
    const row = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { name: b.name, position },
      create: { name: b.name, slug: b.slug, position },
    })
    brandId.set(b.name, row.id)
  }
  log(`[seed] ${DEMO_CATEGORIES.length} categorias, ${DEMO_BRANDS.length} marcas`)

  // 3) Produtos (+ especificações, imagens e estoque inicial), um por transação.
  let created = 0
  let updated = 0
  let stockInitialized = 0
  for (const p of DEMO_PRODUCTS) {
    const cId = categoryId.get(p.category)
    const bId = brandId.get(p.brand)
    if (!cId || !bId) throw new Error(`Categoria/marca desconhecida em ${p.slug}`)

    await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { slug: p.slug }, select: { id: true } })
      const data = productData(p, cId, bId)
      const row = existing
        ? await tx.product.update({ where: { id: existing.id }, data })
        : await tx.product.create({ data: { slug: p.slug, ...data } })
      if (existing) updated++
      else created++

      await tx.productSpec.deleteMany({ where: { productId: row.id } })
      await tx.productSpec.createMany({
        data: p.specs.map((s, position) => ({ productId: row.id, label: s.label, value: s.value, position })),
      })

      if (p.images?.length) {
        await tx.productImage.deleteMany({ where: { productId: row.id } })
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

      const movements = await tx.stockMovement.count({ where: { productId: row.id } })
      if (movements === 0 && p.initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: row.id,
            type: 'INBOUND',
            reason: 'PURCHASE',
            quantity: p.initialStock,
            userId: user.id,
            note: INITIAL_STOCK_NOTE,
          },
        })
        await tx.product.update({ where: { id: row.id }, data: { stockOnHand: p.initialStock } })
        stockInitialized++
      }
    })
  }
  log(`[seed] produtos: ${created} criados, ${updated} atualizados; estoque inicial em ${stockInitialized}`)

  return {
    admin: user.email,
    categories: DEMO_CATEGORIES.length,
    brands: DEMO_BRANDS.length,
    products: { created, updated },
    stockInitialized,
  }
}
