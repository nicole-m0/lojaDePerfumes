import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { centsToReais } from '@/lib/format'
import type { Product } from '@/types'

const shopInclude = {
  brand: true,
  category: true,
  images: { orderBy: { position: 'asc' } },
  specs: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude

type ShopProductRow = Prisma.ProductGetPayload<{ include: typeof shopInclude }>

function toShopProduct(row: ShopProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category.name,
    categorySlug: row.category.slug,
    brand: row.brand.name,
    price: centsToReais(row.priceCents),
    originalPrice: row.compareAtPriceCents ? centsToReais(row.compareAtPriceCents) : undefined,
    description: row.description,
    imageUrl: row.images[0]?.url,
    gradient: row.gradient ?? undefined,
    icon: row.iconKey ?? undefined,
    rating: row.ratingAvg,
    reviews: row.ratingCount,
    specs: row.specs.map((s) => ({ label: s.label, value: s.value })),
    featured: row.featured,
  }
}

// --- Loja pública ---------------------------------------------------------

export async function listShopProducts(): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    include: shopInclude,
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(toShopProduct)
}

export async function getShopProductBySlug(slug: string): Promise<Product | null> {
  const row = await prisma.product.findFirst({
    where: { slug, status: 'ACTIVE' },
    include: shopInclude,
  })
  return row ? toShopProduct(row) : null
}

export async function getRelatedShopProducts(product: Product, limit = 4): Promise<Product[]> {
  const rows = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      slug: { not: product.slug },
      category: { slug: product.categorySlug },
    },
    include: shopInclude,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toShopProduct)
}

export async function listShopCategories() {
  return prisma.category.findMany({
    where: { products: { some: { status: 'ACTIVE' } } },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: { name: true, slug: true },
  })
}

export async function listShopFacets() {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      where: { products: { some: { status: 'ACTIVE' } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { name: true, slug: true },
    }),
    prisma.brand.findMany({
      where: { products: { some: { status: 'ACTIVE' } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { name: true, slug: true },
    }),
  ])
  return { categories, brands }
}

// --- Painel administrativo ----------------------------------------------

export async function listAdminProducts() {
  return prisma.product.findMany({
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      images: { take: 1, orderBy: { position: 'asc' } },
      _count: { select: { images: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getAdminProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: 'asc' } },
      specs: { orderBy: { position: 'asc' } },
    },
  })
}

export async function listCategoriesForForm() {
  return prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
}

export async function listBrandsForForm() {
  return prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
}

export async function listCategoriesAdmin() {
  return prisma.category.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  })
}

export async function listBrandsAdmin() {
  return prisma.brand.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  })
}

export async function countProducts() {
  return prisma.product.count()
}
