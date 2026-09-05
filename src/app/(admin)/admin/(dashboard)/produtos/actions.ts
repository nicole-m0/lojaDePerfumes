'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { reaisToCents } from '@/lib/format'
import { slugify } from '@/lib/slug'
import { requireStaff } from '@/server/guard'
import { registerManualEntry } from '@/server/stock'

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string> }

const specSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
})

const imageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  alt: z.string().optional(),
})

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, 'Informe um nome com ao menos 2 caracteres.'),
  slug: z.string().trim().optional(),
  description: z.string().trim().min(1, 'Informe a descrição.'),
  categoryId: z.string().min(1, 'Selecione a categoria.'),
  brandId: z.string().min(1, 'Selecione a marca.'),
  priceReais: z.string().min(1, 'Informe o preço.'),
  compareAtPriceReais: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  featured: z.boolean(),
  iconKey: z.string().optional(),
  gradient: z.string().optional(),
  // Dados físicos p/ frete (Fase 5). Defaults seguros = caixa pequena de perfume.
  weightGrams: z.coerce.number().int().min(1).catch(300),
  heightCm: z.coerce.number().int().min(1).catch(6),
  widthCm: z.coerce.number().int().min(1).catch(11),
  lengthCm: z.coerce.number().int().min(1).catch(16),
  specs: z.array(specSchema),
  images: z.array(imageSchema),
  /** Só é aplicado na criação — edição de estoque passa pela tela /admin/estoque. */
  initialStock: z.coerce.number().int().min(0).catch(0),
})

function parseJsonArray(value: FormDataEntryValue | null): unknown[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function uniqueSlug(desired: string, ignoreId?: string): Promise<string> {
  const base = desired || 'produto'
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const existing = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing || existing.id === ignoreId) return candidate
  }
  return `${base}-${Date.now()}`
}

export async function saveProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const staff = await requireStaff()

  const parsed = productSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    name: formData.get('name'),
    slug: (formData.get('slug') as string) || undefined,
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    brandId: formData.get('brandId'),
    priceReais: formData.get('priceReais'),
    compareAtPriceReais: (formData.get('compareAtPriceReais') as string) || undefined,
    status: formData.get('status'),
    featured: formData.get('featured') === 'on',
    iconKey: (formData.get('iconKey') as string) || undefined,
    gradient: (formData.get('gradient') as string) || undefined,
    weightGrams: formData.get('weightGrams'),
    heightCm: formData.get('heightCm'),
    widthCm: formData.get('widthCm'),
    lengthCm: formData.get('lengthCm'),
    specs: parseJsonArray(formData.get('specs')),
    images: parseJsonArray(formData.get('images')),
    initialStock: formData.get('initialStock'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Dados inválidos.' }
  }

  const d = parsed.data
  const priceCents = reaisToCents(d.priceReais)
  if (priceCents <= 0) return { error: 'Preço inválido.' }
  const compareAtPriceCents = d.compareAtPriceReais ? reaisToCents(d.compareAtPriceReais) : null

  const slug = await uniqueSlug(d.slug ? slugify(d.slug) : slugify(d.name), d.id)

  const scalar = {
    name: d.name,
    slug,
    description: d.description,
    categoryId: d.categoryId,
    brandId: d.brandId,
    priceCents,
    compareAtPriceCents,
    status: d.status,
    featured: d.featured,
    iconKey: d.iconKey || null,
    gradient: d.gradient || null,
    weightGrams: d.weightGrams,
    heightCm: d.heightCm,
    widthCm: d.widthCm,
    lengthCm: d.lengthCm,
  }

  const isNew = !d.id
  const product = d.id
    ? await prisma.product.update({ where: { id: d.id }, data: scalar })
    : await prisma.product.create({ data: scalar })

  await prisma.$transaction([
    prisma.productSpec.deleteMany({ where: { productId: product.id } }),
    prisma.productImage.deleteMany({ where: { productId: product.id } }),
    prisma.productSpec.createMany({
      data: d.specs.map((s, position) => ({
        productId: product.id,
        label: s.label,
        value: s.value,
        position,
      })),
    }),
    prisma.productImage.createMany({
      data: d.images.map((img, position) => ({
        productId: product.id,
        url: img.url,
        publicId: img.publicId ?? null,
        alt: img.alt ?? null,
        position,
      })),
    }),
  ])

  // Estoque inicial só se aplica na criação — edição de estoque é sempre via /admin/estoque.
  if (isNew && d.initialStock > 0) {
    await registerManualEntry({
      productId: product.id,
      reason: 'PURCHASE',
      quantity: d.initialStock,
      note: 'Estoque inicial no cadastro do produto',
      userId: staff.id,
    })
  }

  revalidatePath('/admin/produtos')
  revalidatePath('/')
  revalidatePath(`/produto/${slug}`)
  redirect('/admin/produtos')
}

export async function deleteProduct(formData: FormData): Promise<void> {
  await requireStaff()
  const id = formData.get('id')
  if (typeof id !== 'string' || !id) return

  await prisma.product.delete({ where: { id } })
  revalidatePath('/admin/produtos')
  revalidatePath('/')
  redirect('/admin/produtos')
}
