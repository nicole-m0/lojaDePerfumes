import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { products } from '../src/data/products'
import { reaisToCents } from '../src/lib/format'
import { slugify } from '../src/lib/slug'

const prisma = new PrismaClient()

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'Administrador'

  if (!email || !password) {
    console.warn('[seed] ADMIN_EMAIL / ADMIN_PASSWORD não definidos — pulando usuário admin.')
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: Role.OWNER, isActive: true },
    create: { email, name, passwordHash, role: Role.OWNER },
  })
  console.log(`[seed] usuário admin garantido: ${user.email} (${user.role})`)
}

async function seedCatalog() {
  const categoryNames = [...new Set(products.map((p) => p.category))]
  const brandNames = [...new Set(products.map((p) => p.brand))]

  const categoryIdByName = new Map<string, string>()
  for (const [index, name] of categoryNames.entries()) {
    const row = await prisma.category.upsert({
      where: { name },
      update: { position: index },
      create: { name, slug: slugify(name), position: index },
    })
    categoryIdByName.set(name, row.id)
  }

  const brandIdByName = new Map<string, string>()
  for (const [index, name] of brandNames.entries()) {
    const row = await prisma.brand.upsert({
      where: { name },
      update: { position: index },
      create: { name, slug: slugify(name), position: index },
    })
    brandIdByName.set(name, row.id)
  }

  for (const p of products) {
    // Dados físicos p/ frete (weightGrams/heightCm/widthCm/lengthCm) não são
    // definidos aqui: o catálogo de origem não os tem. Produtos novos herdam os
    // defaults seguros do schema; os já existentes mantêm o que o admin ajustou.
    const data = {
      name: p.name,
      description: p.description,
      status: 'ACTIVE' as const,
      featured: p.featured ?? false,
      priceCents: reaisToCents(p.price),
      compareAtPriceCents: p.originalPrice ? reaisToCents(p.originalPrice) : null,
      ratingAvg: p.rating,
      ratingCount: p.reviews,
      iconKey: p.icon,
      gradient: p.gradient,
      categoryId: categoryIdByName.get(p.category)!,
      brandId: brandIdByName.get(p.brand)!,
    }

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    })

    // Especificações: recria para manter idempotência.
    await prisma.productSpec.deleteMany({ where: { productId: product.id } })
    if (p.specs.length) {
      await prisma.productSpec.createMany({
        data: p.specs.map((spec, position) => ({
          productId: product.id,
          label: spec.label,
          value: spec.value,
          position,
        })),
      })
    }
  }

  console.log(
    `[seed] catálogo: ${categoryNames.length} categorias, ${brandNames.length} marcas, ${products.length} produtos`,
  )
}

async function main() {
  await seedAdmin()
  await seedCatalog()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
