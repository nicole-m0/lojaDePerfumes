import { Suspense } from 'react'
import HomeView from '@/components/HomeView'
import { listShopFacets, listShopProducts } from '@/server/catalog'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [products, facets] = await Promise.all([listShopProducts(), listShopFacets()])

  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <HomeView
        products={products}
        categories={facets.categories.map((c) => c.name)}
        brands={facets.brands.map((b) => b.name)}
      />
    </Suspense>
  )
}
