import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slug'
import { DEMO_BRANDS, DEMO_CATEGORIES, DEMO_PRODUCTS, type DemoProduct } from './demo-catalog'

const bySlug = new Map(DEMO_PRODUCTS.map((p) => [p.slug, p]))
const spec = (p: DemoProduct, label: string) => p.specs.find((s) => s.label === label)?.value

// Marcas e produtos reais que não podem aparecer no catálogo fictício (inclui as
// marcas do catálogo antigo e nomes parecidos com os da demonstração).
const REAL_NAMES = [
  'avon', 'botic[aá]rio', 'natura', 'hinode', 'eudora', 'jequiti', 'quem disse', 'berenice',
  'blossom', 'granado', 'phebo', 'nivea', 'mary kay', 'ciclo', 'jardin', 'velluré', 'vellura',
  'chanel', 'dior', 'lanc[oô]me', 'carolina herrera', 'rabanne', 'gaultier', 'scandal+',
  'calvin klein', 'hugo boss', 'armani', 'versace', 'guerlain', 'saint laurent', 'ysl',
  'givenchy', 'prada', 'gucci', 'dolce', 'lattafa', 'occitane', "victoria's secret",
  'bath & body works', 'sephora', 'kaiak', 'malbec', 'floratta', 'lily', 'liz', 'egeo',
  'ekos', 'biografia', 'kriska', 'luna', 'nativa spa', 'cuide-se bem', 'tom ford', 'kenzo',
  'herm[eè]s', 'montblanc', 'azzaro', 'bvlgari', 'lacoste', 'mugler', 'valentino', 'burberry',
]
const REAL_RE = new RegExp(`(^|[^\\p{L}])(${REAL_NAMES.join('|')})(?![\\p{L}])`, 'iu')

// Nada de prova social inventada nem alusão a produto de terceiros.
const FORBIDDEN_CLAIMS = /inspira[çd]|avalia[çc]|estrelas|depoimento|mais vendid|vendidos|best.?seller|clone|contratipo|dermatologicamente|hipoalerg/i

const allText = (p: DemoProduct) =>
  [p.name, p.description, p.brand, p.category, ...p.specs.flatMap((s) => [s.label, s.value])].join(' \n ')

describe('catálogo de demonstração — estrutura', () => {
  it('tem 32 produtos, 6 categorias e 6 marcas', () => {
    expect(DEMO_PRODUCTS).toHaveLength(32)
    expect(DEMO_CATEGORIES).toHaveLength(6)
    expect(DEMO_BRANDS).toHaveLength(6)
  })

  it('cobre todas as categorias pedidas, com pelo menos 5 produtos cada', () => {
    for (const c of DEMO_CATEGORIES) {
      expect(DEMO_PRODUCTS.filter((p) => p.category === c.name).length, c.name).toBeGreaterThanOrEqual(5)
    }
    expect(DEMO_CATEGORIES.map((c) => c.name)).toEqual([
      'Perfumes Femininos',
      'Perfumes Masculinos',
      'Perfumes Unissex',
      'Corpo e Banho',
      'Hidratantes',
      'Kits e Presentes',
    ])
  })

  it('todas as marcas são usadas e todo produto usa marca/categoria cadastradas', () => {
    const brands = new Set<string>(DEMO_BRANDS.map((b) => b.name))
    const cats = new Set<string>(DEMO_CATEGORIES.map((c) => c.name))
    for (const p of DEMO_PRODUCTS) {
      expect(brands.has(p.brand), p.slug).toBe(true)
      expect(cats.has(p.category), p.slug).toBe(true)
    }
    for (const b of brands) expect(DEMO_PRODUCTS.some((p) => p.brand === b), b).toBe(true)
  })

  it('slugs e nomes são únicos; slugs são URL-safe e coerentes com slugify', () => {
    expect(new Set(DEMO_PRODUCTS.map((p) => p.slug)).size).toBe(DEMO_PRODUCTS.length)
    expect(new Set(DEMO_PRODUCTS.map((p) => p.name)).size).toBe(DEMO_PRODUCTS.length)
    for (const p of DEMO_PRODUCTS) expect(p.slug).toBe(slugify(p.slug))
    for (const c of DEMO_CATEGORIES) expect(c.slug).toBe(slugify(c.name))
    for (const b of DEMO_BRANDS) expect(b.slug).toBe(slugify(b.name))
  })
})

describe('catálogo de demonstração — dados de cada produto', () => {
  it.each(DEMO_PRODUCTS.map((p) => [p.slug, p] as const))('%s está completo e coerente', (_slug, p) => {
    expect(p.name.trim().length).toBeGreaterThan(5)
    expect(p.description.length).toBeGreaterThanOrEqual(80)
    expect(p.description.length).toBeLessThanOrEqual(400)

    for (const v of [p.priceCents, p.costCents, p.initialStock, p.weightGrams, p.heightCm, p.widthCm, p.lengthCm]) {
      expect(Number.isInteger(v)).toBe(true)
    }
    expect(p.priceCents).toBeGreaterThan(0)
    expect(p.costCents).toBeGreaterThan(0)
    // Margem plausível: custo entre 25% e 50% do preço.
    expect(p.costCents / p.priceCents).toBeGreaterThanOrEqual(0.25)
    expect(p.costCents / p.priceCents).toBeLessThanOrEqual(0.5)
    if (p.compareAtPriceCents !== undefined) {
      expect(Number.isInteger(p.compareAtPriceCents)).toBe(true)
      expect(p.compareAtPriceCents).toBeGreaterThan(p.priceCents)
    }
    expect(p.initialStock).toBeGreaterThanOrEqual(0)
    expect(p.initialStock).toBeLessThanOrEqual(50)
    for (const v of [p.weightGrams, p.heightCm, p.widthCm, p.lengthCm]) expect(v).toBeGreaterThan(0)

    expect(p.specs.length).toBeGreaterThanOrEqual(3)
    for (const s of p.specs) {
      expect(s.label.trim()).not.toBe('')
      expect(s.value.trim()).not.toBe('')
    }
    expect(new Set(p.specs.map((s) => s.label)).size).toBe(p.specs.length)

    // Sem campos de avaliação/vendas no catálogo.
    expect(Object.keys(p)).not.toEqual(expect.arrayContaining(['rating']))
    for (const k of Object.keys(p)) expect(k).not.toMatch(/rating|review|sold|sales/i)
  })

  it('perfumes: gênero da especificação bate com a categoria e o volume bate com o nome', () => {
    const genderOf: Record<string, string> = {
      'Perfumes Femininos': 'Feminino',
      'Perfumes Masculinos': 'Masculino',
      'Perfumes Unissex': 'Unissex',
    }
    const perfumes = DEMO_PRODUCTS.filter((p) => p.category in genderOf)
    expect(perfumes).toHaveLength(16)
    for (const p of perfumes) {
      expect(spec(p, 'Gênero'), p.slug).toBe(genderOf[p.category])
      for (const label of ['Volume', 'Concentração', 'Família olfativa', 'Notas de saída', 'Notas de coração', 'Notas de fundo']) {
        expect(spec(p, label), `${p.slug} ${label}`).toBeTruthy()
      }
      expect(p.name, p.slug).toContain(spec(p, 'Volume')!)
      expect(p.name, p.slug).toContain(spec(p, 'Concentração')!)
    }
  })

  it('corpo, banho e hidratantes informam conteúdo, indicação e modo de uso', () => {
    for (const p of DEMO_PRODUCTS.filter((x) => x.category === 'Corpo e Banho' || x.category === 'Hidratantes')) {
      for (const label of ['Conteúdo', 'Indicação', 'Modo de uso']) expect(spec(p, label), `${p.slug} ${label}`).toBeTruthy()
    }
  })

  it('kits: itens existem, não são kits, preço "de" = soma dos avulsos e custo cobre os itens', () => {
    const kits = DEMO_PRODUCTS.filter((p) => p.category === 'Kits e Presentes')
    expect(kits).toHaveLength(5)
    for (const k of kits) {
      expect(spec(k, 'Conteúdo do kit'), k.slug).toBeTruthy()
      if (!k.kitOf) continue
      const items = k.kitOf.map((s) => bySlug.get(s))
      expect(items.every(Boolean), k.slug).toBe(true)
      for (const item of items) expect(item!.category, k.slug).not.toBe('Kits e Presentes')
      const sum = items.reduce((acc, i) => acc + i!.priceCents, 0)
      expect(k.compareAtPriceCents, k.slug).toBe(sum)
      expect(k.priceCents, k.slug).toBeLessThan(sum)
      const costSum = items.reduce((acc, i) => acc + i!.costCents, 0)
      expect(k.costCents, k.slug).toBeGreaterThanOrEqual(costSum)
      // Conteúdo descrito cita cada item pelo nome.
      for (const item of items) expect(spec(k, 'Conteúdo do kit')).toContain(item!.name)
    }
  })

  it('só kitOf pode referenciar outros produtos; kitOf só em kits', () => {
    for (const p of DEMO_PRODUCTS) {
      if (p.kitOf) expect(p.category).toBe('Kits e Presentes')
    }
  })

  it('demonstra os estados da loja: destaques, promoções e um produto esgotado', () => {
    expect(DEMO_PRODUCTS.filter((p) => p.featured).length).toBeGreaterThanOrEqual(4)
    expect(DEMO_PRODUCTS.filter((p) => p.compareAtPriceCents).length).toBeGreaterThanOrEqual(3)
    expect(DEMO_PRODUCTS.filter((p) => p.initialStock === 0).map((p) => p.slug)).toEqual([
      'fumaca-de-incenso-extrait-de-parfum-30ml',
    ])
  })

  it('imagens (quando houver) são URLs absolutas https com texto alternativo', () => {
    for (const p of DEMO_PRODUCTS) {
      for (const img of p.images ?? []) {
        expect(new URL(img.url).protocol, p.slug).toBe('https:')
        expect(img.alt.trim(), p.slug).not.toBe('')
      }
    }
  })
})

describe('catálogo de demonstração — conteúdo original', () => {
  it('nenhuma marca ou produto real é citado', () => {
    const offenders = DEMO_PRODUCTS.filter((p) => REAL_RE.test(allText(p))).map((p) => p.slug)
    expect(offenders).toEqual([])
    for (const b of DEMO_BRANDS) expect(REAL_RE.test(b.name), b.name).toBe(false)
  })

  it('sem prova social inventada ou alusão a produtos de terceiros', () => {
    const offenders = DEMO_PRODUCTS.filter((p) => FORBIDDEN_CLAIMS.test(allText(p))).map((p) => p.slug)
    expect(offenders).toEqual([])
  })

  it('o filtro de marcas reais funciona (controle do próprio teste)', () => {
    expect(REAL_RE.test('Perfume da Natura')).toBe(true)
    expect(REAL_RE.test('O Boticário')).toBe(true)
    expect(REAL_RE.test('leitura natural')).toBe(false)
  })
})
