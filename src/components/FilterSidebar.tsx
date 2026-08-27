export interface Filters {
  categories: string[]
  brands: string[]
  minPrice: string
  maxPrice: string
  onlyPromo: boolean
}

interface FilterSidebarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  categories: string[]
  brands: string[]
  className?: string
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export default function FilterSidebar({
  filters,
  onChange,
  categories,
  brands,
  className = '',
}: FilterSidebarProps) {
  return (
    <aside className={`space-y-6 ${className}`}>
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Categorias
        </h3>
        <ul className="space-y-2">
          {categories.map((category) => (
            <li key={category}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-600 transition hover:text-venus-600">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={() =>
                    onChange({ ...filters, categories: toggleValue(filters.categories, category) })
                  }
                  className="h-4 w-4 rounded border-neutral-300 text-venus-600 focus:ring-venus-400"
                />
                {category}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Marcas
        </h3>
        <ul className="space-y-2">
          {brands.map((brand) => (
            <li key={brand}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-neutral-600 transition hover:text-venus-600">
                <input
                  type="checkbox"
                  checked={filters.brands.includes(brand)}
                  onChange={() => onChange({ ...filters, brands: toggleValue(filters.brands, brand) })}
                  className="h-4 w-4 rounded border-neutral-300 text-venus-600 focus:ring-venus-400"
                />
                {brand}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Faixa de preço
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="R$ Mín"
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-venus-300 focus:ring-2 focus:ring-venus-100"
          />
          <span className="text-neutral-300">–</span>
          <input
            type="number"
            min={0}
            placeholder="R$ Máx"
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-venus-300 focus:ring-2 focus:ring-venus-100"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-neutral-600 transition hover:text-venus-600">
        <input
          type="checkbox"
          checked={filters.onlyPromo}
          onChange={() => onChange({ ...filters, onlyPromo: !filters.onlyPromo })}
          className="h-4 w-4 rounded border-neutral-300 text-venus-600 focus:ring-venus-400"
        />
        Apenas promoções
      </label>

      {(filters.categories.length > 0 ||
        filters.brands.length > 0 ||
        filters.minPrice ||
        filters.maxPrice ||
        filters.onlyPromo) && (
        <button
          type="button"
          onClick={() =>
            onChange({ categories: [], brands: [], minPrice: '', maxPrice: '', onlyPromo: false })
          }
          className="text-xs font-semibold text-venus-600 underline underline-offset-2 hover:text-venus-700"
        >
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
