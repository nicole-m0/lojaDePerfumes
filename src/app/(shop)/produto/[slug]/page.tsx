import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProductBySlug, getRelatedProducts, products } from '@/data/products'
import ProductDetailView from '@/components/ProductDetailView'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) return { title: 'Produto não encontrado' }

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
    },
  }
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) notFound()

  const related = getRelatedProducts(product)

  return <ProductDetailView product={product} related={related} />
}
