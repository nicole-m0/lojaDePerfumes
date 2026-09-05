import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getRelatedShopProducts, getShopProductBySlug } from '@/server/catalog'
import ProductDetailView from '@/components/ProductDetailView'

interface PageProps {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getShopProductBySlug(slug)
  if (!product) return { title: 'Produto não encontrado' }

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = await getShopProductBySlug(slug)
  if (!product) notFound()

  const related = await getRelatedShopProducts(product)

  return <ProductDetailView product={product} related={related} />
}
