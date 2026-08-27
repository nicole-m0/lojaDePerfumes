'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slug'
import { requireStaff } from '@/server/guard'

export type TaxonomyState = { error?: string; ok?: boolean }

type Kind = 'category' | 'brand'

const nameSchema = z.string().trim().min(2, 'Informe um nome com ao menos 2 caracteres.')

function kindOf(formData: FormData): Kind {
  return formData.get('kind') === 'brand' ? 'brand' : 'category'
}

async function createOne(kind: Kind, name: string) {
  const data = { name, slug: slugify(name) }
  return kind === 'brand'
    ? prisma.brand.create({ data })
    : prisma.category.create({ data })
}

async function renameOne(kind: Kind, id: string, name: string) {
  const data = { name, slug: slugify(name) }
  return kind === 'brand'
    ? prisma.brand.update({ where: { id }, data })
    : prisma.category.update({ where: { id }, data })
}

async function productCount(kind: Kind, id: string) {
  return kind === 'brand'
    ? prisma.product.count({ where: { brandId: id } })
    : prisma.product.count({ where: { categoryId: id } })
}

async function deleteOne(kind: Kind, id: string) {
  return kind === 'brand'
    ? prisma.brand.delete({ where: { id } })
    : prisma.category.delete({ where: { id } })
}

export async function createTaxonomy(
  _prev: TaxonomyState,
  formData: FormData,
): Promise<TaxonomyState> {
  await requireStaff()
  const parsed = nameSchema.safeParse(formData.get('name'))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message }

  try {
    await createOne(kindOf(formData), parsed.data)
  } catch {
    return { error: 'Já existe um item com esse nome.' }
  }

  revalidatePath('/admin/categorias')
  return { ok: true }
}

export async function renameTaxonomy(formData: FormData): Promise<void> {
  await requireStaff()
  const id = String(formData.get('id') ?? '')
  const parsed = nameSchema.safeParse(formData.get('name'))
  if (!id || !parsed.success) return

  await renameOne(kindOf(formData), id, parsed.data)
  revalidatePath('/admin/categorias')
}

export async function deleteTaxonomy(formData: FormData): Promise<void> {
  await requireStaff()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const kind = kindOf(formData)
  if ((await productCount(kind, id)) > 0) return // em uso — não remove

  await deleteOne(kind, id)
  revalidatePath('/admin/categorias')
}
