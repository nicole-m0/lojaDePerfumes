import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import {
  getAdminProduct,
  listBrandsForForm,
  listCategoriesForForm,
} from '@/server/catalog'
import { centsToReais } from '@/lib/format'
import { deleteProduct } from '@/app/(admin)/admin/(dashboard)/produtos/actions'
import ProductForm, { type ProductFormValues } from '@/components/admin/ProductForm'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Editar produto' }

interface PageProps {
  params: Promise<{ id: string }>
}

function reaisString(cents: number | null | undefined): string {
  if (cents == null) return ''
  return centsToReais(cents).toString().replace('.', ',')
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params
  const [product, categories, brands] = await Promise.all([
    getAdminProduct(id),
    listCategoriesForForm().catch(() => []),
    listBrandsForForm().catch(() => []),
  ])

  if (!product) notFound()

  const initialValues: ProductFormValues = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categoryId,
    brandId: product.brandId,
    priceReais: reaisString(product.priceCents),
    compareAtPriceReais: reaisString(product.compareAtPriceCents),
    status: product.status,
    featured: product.featured,
    stockOnHand: product.stockOnHand,
    iconKey: product.iconKey ?? '',
    gradient: product.gradient ?? '',
    weightGrams: product.weightGrams,
    heightCm: product.heightCm,
    widthCm: product.widthCm,
    lengthCm: product.lengthCm,
    specs: product.specs.map((s) => ({ label: s.label, value: s.value })),
    images: product.images.map((img) => ({
      url: img.url,
      publicId: img.publicId ?? undefined,
      alt: img.alt ?? undefined,
    })),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/produtos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Produtos
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
        </div>

        <form action={deleteProduct}>
          <input type="hidden" name="id" value={product.id} />
          <Button type="submit" variant="destructive" size="sm">
            Excluir
          </Button>
        </form>
      </div>

      <ProductForm
        categories={categories}
        brands={brands}
        initialValues={initialValues}
        submitLabel="Salvar alterações"
      />
    </div>
  )
}
