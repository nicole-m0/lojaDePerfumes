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
  /** Prefixo para ids únicos (o filtro aparece no desktop e na gaveta do celular). */
  idPrefix?: string
}

const GROUP_TITLE = 'eyebrow mb-4 text-ink-soft'
const OPTION =
  'flex cursor-pointer items-center gap-3 text-sm text-ink/85 transition-colors hover:text-ink'
// Caixa quadrada fina, preenchida em tinta quando marcada.
const CHECKBOX =
  'h-4 w-4 shrink-0 cursor-pointer appearance-none border border-ink/35 bg-ivory transition-colors checked:border-ink checked:bg-ink checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2016%2016%27%3E%3Cpath%20d%3D%27M4%208.5l2.5%202.5L12%205.5%27%20fill%3D%27none%27%20stroke%3D%27%23fbf8f5%27%20stroke-width%3D%271.6%27/%3E%3C/svg%3E")]'
const PRICE_INPUT =
  'h-10 w-full border border-ink/20 bg-ivory px-3 text-sm tabular-nums text-ink outline-none placeholder:text-ink-soft focus:border-ink'

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export default function FilterSidebar({
  filters,
  onChange,
  categories,
  brands,
  className = '',
  idPrefix = 'filtro',
}: FilterSidebarProps) {
  const hasActive =
    filters.categories.length > 0 ||
    filters.brands.length > 0 ||
    Boolean(filters.minPrice) ||
    Boolean(filters.maxPrice) ||
    filters.onlyPromo

  return (
    <aside aria-label="Filtros" className={`text-ink ${className}`}>
      <fieldset className="border-t border-hairline pb-6 pt-5">
        <legend className={GROUP_TITLE}>Coleções</legend>
        <ul className="space-y-2.5">
          {categories.map((category) => (
            <li key={category}>
              <label className={OPTION}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={() =>
                    onChange({ ...filters, categories: toggleValue(filters.categories, category) })
                  }
                  className={CHECKBOX}
                />
                {category}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="border-t border-hairline pb-6 pt-5">
        <legend className={GROUP_TITLE}>Marcas</legend>
        <ul className="space-y-2.5">
          {brands.map((brand) => (
            <li key={brand}>
              <label className={OPTION}>
                <input
                  type="checkbox"
                  checked={filters.brands.includes(brand)}
                  onChange={() =>
                    onChange({ ...filters, brands: toggleValue(filters.brands, brand) })
                  }
                  className={CHECKBOX}
                />
                {brand}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="border-t border-hairline pb-6 pt-5">
        <legend className={GROUP_TITLE}>Faixa de preço (R$)</legend>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor={`${idPrefix}-min`}>
            Preço mínimo
          </label>
          <input
            id={`${idPrefix}-min`}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Mín."
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            className={PRICE_INPUT}
          />
          <span aria-hidden="true" className="text-ink-soft">
            –
          </span>
          <label className="sr-only" htmlFor={`${idPrefix}-max`}>
            Preço máximo
          </label>
          <input
            id={`${idPrefix}-max`}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Máx."
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className={PRICE_INPUT}
          />
        </div>
      </fieldset>

      <div className="border-t border-hairline pt-5">
        <label className={OPTION}>
          <input
            type="checkbox"
            checked={filters.onlyPromo}
            onChange={() => onChange({ ...filters, onlyPromo: !filters.onlyPromo })}
            className={CHECKBOX}
          />
          Apenas promoções
        </label>
      </div>

      {hasActive && (
        <button
          type="button"
          onClick={() =>
            onChange({ categories: [], brands: [], minPrice: '', maxPrice: '', onlyPromo: false })
          }
          className="link-underline mt-6 pb-0.5 text-sm font-medium text-ink"
        >
          Limpar filtros
        </button>
      )}
    </aside>
  )
}
