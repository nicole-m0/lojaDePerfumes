import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listBrandsForForm, listCategoriesForForm } from '@/server/catalog'
import ProductForm, { type ProductFormValues } from '@/components/admin/ProductForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Novo produto' }

const EMPTY: ProductFormValues = {
  name: '',
  slug: '',
  description: '',
  categoryId: '',
  brandId: '',
  priceReais: '',
  compareAtPriceReais: '',
  status: 'DRAFT',
  featured: false,
  iconKey: '',
  gradient: '',
  specs: [],
  images: [],
}

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([
    listCategoriesForForm().catch(() => []),
    listBrandsForForm().catch(() => []),
  ])

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/produtos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Produtos
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Novo produto</h1>
      </div>

      {categories.length === 0 || brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre ao menos uma categoria e uma marca em{' '}
          <Link href="/admin/categorias" className="underline">
            Categorias &amp; Marcas
          </Link>{' '}
          antes de criar produtos.
        </p>
      ) : (
        <ProductForm
          categories={categories}
          brands={brands}
          initialValues={EMPTY}
          submitLabel="Criar produto"
        />
      )}
    </div>
  )
}
