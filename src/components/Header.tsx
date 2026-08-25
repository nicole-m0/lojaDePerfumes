import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ShoppingCart } from 'lucide-react'
import { useCart } from '../context/useCart'
import venusFlower from '../assets/venus-flower.png'

export default function Header() {
  const { totalItems, openCart } = useCart()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    navigate(`/${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-venus-100 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-1.5">
          <img src={venusFlower} alt="" className="h-9 w-auto drop-shadow-sm sm:h-11" />
          <span className="font-script text-2xl leading-none text-venus-600 sm:text-3xl">
            Vênus
          </span>
        </Link>

        <form onSubmit={handleSearch} className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full rounded-full border border-venus-100 bg-venus-50/60 py-2.5 pl-4 pr-11 text-sm text-neutral-700 outline-none transition focus:border-venus-300 focus:bg-white focus:ring-2 focus:ring-venus-200"
          />
          <button
            type="submit"
            aria-label="Buscar"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-venus-500 transition hover:bg-venus-100"
          >
            <Search className="h-4.5 w-4.5" />
          </button>
        </form>

        <button
          type="button"
          onClick={openCart}
          aria-label="Abrir carrinho"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-venus-100 text-venus-600 transition hover:bg-venus-50"
        >
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-venus-600 px-1 text-[11px] font-bold text-white shadow-sm">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
