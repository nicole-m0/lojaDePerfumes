'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import { products } from '@/data/products'
import ProductCard from '@/components/ProductCard'
import FilterSidebar, { type Filters } from '@/components/FilterSidebar'
import type { ProductCategory } from '@/types'

const EMPTY_FILTERS: Filters = {
  categories: [],
  brands: [],
  minPrice: '',
  maxPrice: '',
  onlyPromo: false,
}

export default function HomeView() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q')?.toLowerCase().trim() ?? ''
  const categoriaParam = searchParams.get('categoria') as ProductCategory | null

  const [filters, setFilters] = useState<Filters>(
    categoriaParam ? { ...EMPTY_FILTERS, categories: [categoriaParam] } : EMPTY_FILTERS,
  )
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Sincroniza o filtro de categoria quando o usuário chega por um link com ?categoria=
  const [appliedCategoriaParam, setAppliedCategoriaParam] = useState(categoriaParam)
  if (categoriaParam !== appliedCategoriaParam) {
    setAppliedCategoriaParam(categoriaParam)
    if (categoriaParam) {
      setFilters((f) => ({ ...f, categories: [categoriaParam] }))
    }
  }

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (query && !product.name.toLowerCase().includes(query)) return false
      if (filters.categories.length && !filters.categories.includes(product.category)) return false
      if (filters.brands.length && !filters.brands.includes(product.brand)) return false
      if (filters.minPrice && product.price < Number(filters.minPrice)) return false
      if (filters.maxPrice && product.price > Number(filters.maxPrice)) return false
      if (filters.onlyPromo && !product.originalPrice) return false
      return true
    })
  }, [query, filters])

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6">
      {!query && (
        <section className="bg-mesh relative mt-4 overflow-hidden rounded-3xl border border-venus-100 px-6 py-10 sm:px-10 sm:py-14">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-venus-600 shadow-sm">
            ✨ Nova coleção disponível
          </p>
          <h1 className="mt-4 max-w-lg font-script text-4xl leading-tight text-venus-700 sm:text-5xl">
            Beleza que floresce em você
          </h1>
          <p className="mt-3 max-w-md text-sm text-neutral-600 sm:text-base">
            Perfumes, cosméticos e presentes selecionados para realçar sua essência. Frete para
            todo o Brasil e atendimento pelo WhatsApp.
          </p>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between gap-4 sm:hidden">
        <h2 className="text-base font-semibold text-neutral-800">
          {query ? `Resultados para "${query}"` : 'Todos os produtos'}
        </h2>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-venus-200 px-3 py-1.5 text-xs font-semibold text-venus-600"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-8 pb-16 sm:mt-8 lg:grid-cols-[220px_1fr]">
        <FilterSidebar filters={filters} onChange={setFilters} className="hidden lg:block" />

        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="absolute inset-0 bg-neutral-900/40"
              onClick={() => setMobileFiltersOpen(false)}
            />
            <div className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-800">Filtros</h3>
                <button onClick={() => setMobileFiltersOpen(false)} aria-label="Fechar filtros">
                  <X className="h-5 w-5 text-neutral-500" />
                </button>
              </div>
              <FilterSidebar filters={filters} onChange={setFilters} />
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-4 hidden text-lg font-semibold text-neutral-800 sm:block">
            {query ? `Resultados para "${query}"` : 'Todos os produtos'}
            <span className="ml-2 text-sm font-normal text-neutral-400">
              ({filtered.length} {filtered.length === 1 ? 'item' : 'itens'})
            </span>
          </h2>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-venus-200 py-20 text-center">
              <p className="text-sm text-neutral-500">
                Nenhum produto encontrado com os filtros selecionados.
              </p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-3 text-sm font-semibold text-venus-600 underline underline-offset-2"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
