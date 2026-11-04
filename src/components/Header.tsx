'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Menu, Search, X } from 'lucide-react'
import { useCart } from '../context/useCart'
import Logo from './brand/Logo'
import { STORE_NAME } from '../config/store'
import { Container } from './shop/ui'

interface HeaderProps {
  /** Categorias com produtos ativos (lidas no layout, no servidor). */
  categories: { name: string; slug: string }[]
}

const categoryHref = (name: string) => `/?categoria=${encodeURIComponent(name)}`

const subscribeNoop = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

// Navegação do desktop com rótulos curtos e fixos (os nomes das categorias vêm do
// banco e podem ser longos); a lista completa fica no menu do celular e na home.
const DESKTOP_NAV = [
  { href: '/#colecoes', label: 'Coleções' },
  { href: '/?promo=1', label: 'Promoções' },
]

export default function Header({ categories }: HeaderProps) {
  const { totalItems, openCart, isHydrated } = useCart()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Fecha o menu ao navegar.
  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [pathname, searchParams])

  // Esc fecha o menu do celular; trava a rolagem do fundo enquanto aberto.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    router.push(`/${params.toString() ? `?${params.toString()}` : ''}`)
  }

  // O cabeçalho está dentro de um <Suspense> e pode hidratar DEPOIS do provider do
  // carrinho já ter lido o localStorage. Durante a hidratação do próprio cabeçalho,
  // `isClient` é false (snapshot do servidor), então o contador bate com o HTML do
  // servidor (0) e só depois mostra a quantidade real.
  const isClient = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot)
  const count = isClient && isHydrated ? totalItems : 0

  const searchForm = (id: string) => (
    <form onSubmit={handleSearch} role="search" className="relative">
      <label htmlFor={id} className="sr-only">
        Buscar produtos
      </label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar na loja"
        className="h-11 w-full border-b border-ink/25 bg-transparent pr-10 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-ink"
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-ink"
      >
        <Search className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </form>
  )

  return (
    <>
      <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur-md">
        {/* Faixa de aviso: deixa claro que é uma loja demonstrativa. */}
        <div className="bg-ink text-ivory/85">
          <Container className="flex h-8 items-center justify-center">
            <p className="eyebrow text-[0.625rem] tracking-[0.22em]">
              Loja demonstrativa · Projeto de portfólio
            </p>
          </Container>
        </div>

        <div className="border-b border-hairline">
          <Container className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 lg:h-20">
            {/* Esquerda: menu (celular) / navegação (desktop) */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Abrir menu"
                aria-expanded={menuOpen}
                aria-controls="menu-celular"
                className="-ml-2 flex h-10 w-10 items-center justify-center text-ink lg:hidden"
              >
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <nav aria-label="Categorias" className="hidden lg:block">
                <ul className="flex items-center gap-7">
                  <li>
                    <Link
                      href="/#catalogo"
                      className="eyebrow link-underline whitespace-nowrap pb-1 text-ink"
                    >
                      Loja
                    </Link>
                  </li>
                  {DESKTOP_NAV.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="eyebrow link-underline whitespace-nowrap pb-1 text-ink-soft hover:text-ink"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* Centro: marca */}
            <Link
              href="/"
              aria-label={`${STORE_NAME} — página inicial`}
              className="justify-self-center"
            >
              {/* Um tamanho por faixa de tela, cada um num wrapper próprio: passar
                `hidden` direto ao Logo conflitava com o `inline-flex` dele. */}
              <span className="hidden sm:block">
                <Logo size="md" />
              </span>
              <span className="block sm:hidden">
                <Logo size="sm" />
              </span>
            </Link>

            {/* Direita: busca + sacola */}
            <div className="flex items-center justify-end gap-1 sm:gap-4">
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label={searchOpen ? 'Fechar busca' : 'Abrir busca'}
                aria-expanded={searchOpen}
                aria-controls="busca-desktop"
                className="hidden h-10 w-10 items-center justify-center text-ink lg:flex"
              >
                {searchOpen ? (
                  <X className="h-4.5 w-4.5" strokeWidth={1.5} />
                ) : (
                  <Search className="h-4.5 w-4.5" strokeWidth={1.5} />
                )}
              </button>
              <button
                type="button"
                onClick={openCart}
                aria-label={`Abrir sacola, ${count} ${count === 1 ? 'item' : 'itens'}`}
                className="flex h-10 items-center gap-2 px-1 text-ink"
              >
                <span className="eyebrow">Sacola</span>
                <span className="flex h-6 min-w-6 items-center justify-center border border-ink/30 px-1 text-[0.6875rem] font-semibold tabular-nums">
                  {count}
                </span>
              </button>
            </div>
          </Container>

          {searchOpen && (
            <div id="busca-desktop" className="hidden border-t border-hairline lg:block">
              <Container className="py-4">
                <div className="mx-auto max-w-xl">{searchForm('busca-desktop-campo')}</div>
              </Container>
            </div>
          )}
        </div>
      </header>

      {/* Menu do celular: folha lateral com busca e todas as categorias.
          Fica FORA do <header>: o backdrop-filter do cabeçalho cria um novo bloco
          de contenção e um `fixed` lá dentro ficaria preso à altura do cabeçalho. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" id="menu-celular">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-ivory"
          >
            <div className="flex h-16 items-center justify-between border-b border-hairline px-5">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className="-mr-2 flex h-10 w-10 items-center justify-center text-ink"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="px-5 pt-6">{searchForm('busca-celular')}</div>
            <nav aria-label="Categorias" className="px-5 py-8">
              <p className="eyebrow mb-4 text-ink-soft">Coleções</p>
              <ul className="divide-y divide-hairline border-y border-hairline">
                <li>
                  <Link href="/#catalogo" className="block py-4 font-display text-2xl text-ink">
                    Todos os produtos
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={categoryHref(c.name)}
                      className="block py-4 font-display text-2xl text-ink"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
