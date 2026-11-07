'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import type { Product } from '@/types'
import ProductCard from '@/components/ProductCard'
import FilterSidebar, { type Filters } from '@/components/FilterSidebar'
import { ButtonLink, Container, Eyebrow, TextLink } from '@/components/shop/ui'
import { CAMPAIGN } from '@/config/campaign'
import { STORE_NAME } from '@/config/store'

interface HomeViewProps {
  products: Product[]
  categories: string[]
  brands: string[]
}

const EMPTY_FILTERS: Filters = {
  categories: [],
  brands: [],
  minPrice: '',
  maxPrice: '',
  onlyPromo: false,
}

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    categories: params.getAll('categoria'),
    brands: params.getAll('marca'),
    minPrice: params.get('min') ?? '',
    maxPrice: params.get('max') ?? '',
    onlyPromo: params.get('promo') === '1',
  }
}

function filtersToParams(filters: Filters, query: string): URLSearchParams {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  filters.categories.forEach((c) => params.append('categoria', c))
  filters.brands.forEach((b) => params.append('marca', b))
  if (filters.minPrice) params.set('min', filters.minPrice)
  if (filters.maxPrice) params.set('max', filters.maxPrice)
  if (filters.onlyPromo) params.set('promo', '1')
  return params
}

function countActive(filters: Filters): number {
  return (
    filters.categories.length +
    filters.brands.length +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.onlyPromo ? 1 : 0)
  )
}

const categoryHref = (name: string) => `/?categoria=${encodeURIComponent(name)}`

export default function HomeView({ products, categories, brands }: HomeViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawQuery = searchParams.get('q') ?? ''
  const query = rawQuery.toLowerCase().trim()

  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams))
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const catalogRef = useRef<HTMLElement>(null)

  // Reflete os filtros na URL (compartilhável / navegável), sem rolar a página.
  const lastPushed = useRef('')
  const queryRef = useRef(rawQuery)
  queryRef.current = rawQuery
  useEffect(() => {
    const next = filtersToParams(filters, queryRef.current).toString()
    if (next === lastPushed.current) return
    lastPushed.current = next
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [filters, pathname, router])

  // Navegação externa para a home com outros filtros (links de categoria do
  // cabeçalho/rodapé/produto): a URL muda mas o componente continua montado, então
  // o estado precisa ser relido da URL. Ecos do próprio replace acima são ignorados.
  //
  // Exceção que preserva o comportamento anterior: a busca do cabeçalho manda só
  // `?q=` — nesse caso os filtros já escolhidos continuam valendo junto da busca.
  const lastQuery = useRef(rawQuery)
  useEffect(() => {
    const urlFilters = filtersFromParams(searchParams)
    const fromUrl = filtersToParams(urlFilters, rawQuery).toString()
    const queryChanged = rawQuery !== lastQuery.current
    lastQuery.current = rawQuery
    if (fromUrl === lastPushed.current) return

    if (queryChanged && countActive(urlFilters) === 0) {
      const next = filtersToParams(filters, rawQuery).toString()
      lastPushed.current = next
      if (next !== fromUrl) router.replace(`${pathname}?${next}`, { scroll: false })
      return
    }

    lastPushed.current = fromUrl
    setFilters(urlFilters)
    // `filters` fica fora das dependências de propósito: este efeito reage só à URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rawQuery])

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
  }, [products, query, filters])

  const activeCount = countActive(filters)
  // Com busca ou filtro ativo, a página vira catálogo puro (sem seções editoriais).
  const refined = Boolean(query) || activeCount > 0

  // Ao entrar no modo catálogo a partir da própria página, as seções acima somem:
  // leva o topo do catálogo para a vista em vez de deixar a rolagem "perdida".
  const wasRefined = useRef(refined)
  useEffect(() => {
    if (refined && !wasRefined.current) {
      catalogRef.current?.scrollIntoView({ block: 'start' })
    }
    wasRefined.current = refined
  }, [refined])

  // Gaveta de filtros do celular: Esc fecha e o fundo não rola.
  useEffect(() => {
    if (!mobileFiltersOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileFiltersOpen(false)
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [mobileFiltersOpen])

  const featured = useMemo(() => {
    const flagged = products.filter((p) => p.featured)
    return (flagged.length >= 3 ? flagged : products).slice(0, 5)
  }, [products])

  const catalogTitle = query
    ? `Resultados para “${rawQuery.trim()}”`
    : filters.categories.length === 1
      ? filters.categories[0]
      : filters.onlyPromo && filters.categories.length === 0
        ? 'Promoções'
        : 'Todos os produtos'

  return (
    <main className="flex-1">
      {!refined && (
        <>
          <Hero />
          <CollectionsIndex categories={categories} />
          {featured.length > 0 && <HouseSelection products={featured} />}
          <AtelierBand />
        </>
      )}

      <section
        id="catalogo"
        ref={catalogRef}
        aria-labelledby="catalogo-titulo"
        className={`scroll-mt-28 ${refined ? 'pt-10 sm:pt-14' : 'pt-20 sm:pt-28'}`}
      >
        <Container>
          <div className="flex flex-col gap-6 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Eyebrow>{refined ? 'Catálogo' : 'A loja'}</Eyebrow>
              <h2
                id="catalogo-titulo"
                className="mt-3 text-4xl font-medium leading-none text-ink sm:text-5xl"
              >
                {catalogTitle}
              </h2>
            </div>
            <div className="flex items-center justify-between gap-6 sm:justify-end">
              <p className="text-sm tabular-nums text-ink-soft" aria-live="polite">
                {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
              </p>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="filtros-celular"
                className="flex h-10 items-center gap-2 border border-ink/25 px-4 text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-ink lg:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                Filtrar{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[220px_1fr] lg:gap-14">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              categories={categories}
              brands={brands}
              idPrefix="filtro-desktop"
              className="hidden self-start lg:sticky lg:top-32 lg:block"
            />

            <div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-start gap-4 border-t border-hairline py-16">
                  <p className="font-display text-3xl text-ink">Nada por aqui.</p>
                  <p className="max-w-md text-sm text-ink-soft">
                    Nenhum produto corresponde à busca ou aos filtros escolhidos.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="link-underline pb-0.5 text-sm font-medium text-ink"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 md:grid-cols-3 lg:gap-y-16">
                  {filtered.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* Gaveta de filtros (celular/tablet): sobe da base da tela. */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" id="filtros-celular">
          <button
            type="button"
            aria-label="Fechar filtros"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="filtros-titulo"
            className="relative flex max-h-[88svh] w-full flex-col bg-ivory"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <p id="filtros-titulo" className="font-display text-2xl text-ink">
                Filtrar
              </p>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Fechar filtros"
                className="-mr-2 flex h-10 w-10 items-center justify-center text-ink"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-4">
              <FilterSidebar
                filters={filters}
                onChange={setFilters}
                categories={categories}
                brands={brands}
                idPrefix="filtro-celular"
              />
            </div>
            <div className="border-t border-hairline p-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="flex h-12 w-full items-center justify-center bg-ink text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-ivory"
              >
                Ver {filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Seções editoriais (só quando não há busca/filtro)                           */
/* -------------------------------------------------------------------------- */

function Hero() {
  const image = CAMPAIGN.hero
  return (
    <section aria-labelledby="hero-titulo" className="border-b border-hairline">
      <div
        className={`mx-auto grid max-w-[1360px] ${
          image ? 'lg:min-h-[calc(100svh-7rem)] lg:grid-cols-12' : ''
        }`}
      >
        {image && (
          <div className="relative aspect-[4/5] lg:order-2 lg:col-span-7 lg:aspect-auto">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority
              placeholder="blur"
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover"
            />
          </div>
        )}

        <div
          className={`relative flex flex-col justify-end overflow-hidden px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20 ${
            image ? 'lg:col-span-5' : 'pt-40 sm:pt-56 lg:pt-64'
          }`}
        >
          {/* Sem foto: o "&" da marca em traço fino como elemento gráfico. */}
          {!image && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-6 right-2 select-none font-display text-[14rem] italic leading-none text-transparent [-webkit-text-stroke:1px_var(--color-champagne-300)] sm:text-[22rem] lg:right-16 lg:top-4 lg:text-[28rem]"
            >
              &amp;
            </span>
          )}
          <Eyebrow className="relative">Coleção Ateliê · Perfumaria</Eyebrow>
          <h1
            id="hero-titulo"
            className="relative mt-5 text-[3.25rem] font-medium leading-[0.95] text-ink sm:text-7xl lg:text-[5.5rem]"
          >
            Fragrâncias que contam a sua <em className="font-medium text-brand-700">história</em>
          </h1>
          <p className="relative mt-6 max-w-sm text-[0.95rem] leading-relaxed text-ink-soft">
            Perfumes, cuidados para o corpo e presentes escolhidos com calma — para usar todos os
            dias ou guardar para um momento especial.
          </p>
          <div className="relative mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <ButtonLink href="/#catalogo" size="lg">
              Explorar a loja
            </ButtonLink>
            <TextLink href="/#colecoes">Ver coleções</TextLink>
          </div>
        </div>
      </div>
    </section>
  )
}

function CollectionsIndex({ categories }: { categories: string[] }) {
  const image = CAMPAIGN.collections
  if (categories.length === 0) return null
  return (
    <section
      id="colecoes"
      aria-labelledby="colecoes-titulo"
      className="scroll-mt-28 bg-sand-50 py-20 sm:py-28"
    >
      <Container className={`grid gap-12 ${image ? 'lg:grid-cols-12 lg:gap-16' : ''}`}>
        {image && (
          <div className="relative aspect-[4/5] lg:col-span-5">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              placeholder="blur"
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
        )}
        <div className={image ? 'lg:col-span-7 lg:pt-6' : ''}>
          <Eyebrow>Coleções</Eyebrow>
          <h2
            id="colecoes-titulo"
            className="mt-4 max-w-lg text-4xl font-medium leading-tight text-ink sm:text-5xl"
          >
            Escolha por <em>ocasião</em>, por gesto, por desejo.
          </h2>
          <ol className="mt-10 border-t border-hairline">
            {categories.map((name, index) => (
              <li key={name} className="border-b border-hairline">
                <Link
                  href={categoryHref(name)}
                  className="group flex items-baseline gap-5 py-5 transition-colors sm:gap-8"
                >
                  <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-champagne-600">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-display text-2xl text-ink transition-transform duration-300 group-hover:translate-x-1.5 sm:text-3xl">
                    {name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-auto text-ink-soft opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  )
}

function HouseSelection({ products }: { products: Product[] }) {
  const [first, ...rest] = products
  return (
    <section aria-labelledby="selecao-titulo" className="py-20 sm:py-28">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Seleção da casa</Eyebrow>
            <h2
              id="selecao-titulo"
              className="mt-4 text-4xl font-medium leading-tight text-ink sm:text-5xl"
            >
              Em destaque agora
            </h2>
          </div>
          <TextLink href="/#catalogo">Ver todos os produtos</TextLink>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-12 lg:gap-x-8">
          <ProductCard
            product={first}
            variant="feature"
            className="col-span-2 lg:col-span-6 lg:row-span-2"
          />
          {rest.map((p) => (
            <ProductCard key={p.id} product={p} className="lg:col-span-3" />
          ))}
        </div>
      </Container>
    </section>
  )
}

function AtelierBand() {
  const image = CAMPAIGN.atelier
  return (
    <section aria-labelledby="atelie-titulo" className="bg-ink text-ivory">
      {image && (
        <div className="relative aspect-[16/9] sm:aspect-[2/1] lg:aspect-[21/8]">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            placeholder="blur"
            sizes="100vw"
            className="object-cover object-[50%_60%]"
          />
        </div>
      )}
      <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <p className="eyebrow text-champagne-300">O ateliê</p>
          <h2 id="atelie-titulo" className="mt-4 text-4xl font-medium leading-tight sm:text-5xl">
            Uma perfumaria pensada do frasco ao checkout.
          </h2>
        </div>
        <div className="lg:col-span-7 lg:pt-2">
          <p className="max-w-xl text-[0.95rem] leading-relaxed text-ivory/80">
            A {STORE_NAME} é uma loja demonstrativa, criada para mostrar um e-commerce de perfumaria
            completo: catálogo, sacola, checkout com frete e pagamento, controle de estoque e painel
            administrativo.
          </p>
          <dl className="mt-10 grid gap-6 border-t border-ivory/15 pt-8 sm:grid-cols-3">
            {[
              ['Frete', 'Calculado no checkout a partir do CEP de entrega.'],
              ['Sacola', 'Guardada neste navegador enquanto você escolhe.'],
              ['Atendimento', 'Informações claras para você comprar com tranquilidade.'],
            ].map(([title, text]) => (
              <div key={title}>
                <dt className="eyebrow text-champagne-300">{title}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ivory/80">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  )
}
