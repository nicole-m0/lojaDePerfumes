import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/types'

// WhatsApp da loja (links wa.me): sem número válido em
// NEXT_PUBLIC_STORE_WHATSAPP_NUMBER, nenhum link é gerado e os cinco pontos de
// contato (botão flutuante, rodapé, sacola, gaveta e página de produto) somem.

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
// A sacola chama uma server action ao montar; aqui só o HTML inicial importa.
vi.mock('@/app/(shop)/checkout/actions', () => ({ getCartPricing: vi.fn(() => new Promise(() => {})) }))

const product: Product = {
  id: 'p1',
  slug: 'perfume-teste',
  name: 'Perfume Teste',
  category: 'Perfumes',
  categorySlug: 'perfumes',
  brand: 'Marca Teste',
  price: 100,
  description: 'Descrição',
  rating: 0,
  reviews: 0,
  specs: [],
  availableQuantity: 5,
}

const cart = {
  items: [{ product, quantity: 1 }],
  isHydrated: true,
  isOpen: true,
  totalPrice: 100,
  addItem: vi.fn(),
  removeItem: vi.fn(),
  updateQuantity: vi.fn(),
  clearCart: vi.fn(),
  closeCart: vi.fn(),
}
vi.mock('@/context/useCart', () => ({ useCart: () => cart }))

const VALID_13 = '5521987654321' // 55 + DDD 21 + celular de 9 dígitos
const VALID_12 = '552133334444' // 55 + DDD 21 + fixo de 8 dígitos

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** Recarrega os módulos com a env indicada (`undefined` = variável ausente). */
async function withNumber(value: string | undefined) {
  if (value === undefined) vi.stubEnv('NEXT_PUBLIC_STORE_WHATSAPP_NUMBER', undefined)
  else vi.stubEnv('NEXT_PUBLIC_STORE_WHATSAPP_NUMBER', value)
  vi.resetModules()
}

describe('parseStoreWhatsAppNumber', () => {
  it('aceita 55 + DDD + número (12 ou 13 dígitos)', async () => {
    const { parseStoreWhatsAppNumber } = await import('@/config/store')
    expect(parseStoreWhatsAppNumber(VALID_13)).toBe(VALID_13)
    expect(parseStoreWhatsAppNumber(VALID_12)).toBe(VALID_12)
  })

  it('ausente ou vazio → null', async () => {
    const { parseStoreWhatsAppNumber } = await import('@/config/store')
    expect(parseStoreWhatsAppNumber(undefined)).toBeNull()
    expect(parseStoreWhatsAppNumber('')).toBeNull()
  })

  it.each([
    ['com "+"', '+5521987654321'],
    ['com espaços', '55 21 98765 4321'],
    ['com espaço nas pontas', ' 5521987654321 '],
    ['com traço/parênteses', '55(21)98765-4321'],
    ['sem o código do país', '21987654321'],
    ['outro código de país', '4421987654321'],
    ['curto (11 dígitos)', '55219876543'],
    ['longo (14 dígitos)', '55219876543210'],
    ['com letras', '55219876543ab'],
  ])('inválido %s → null', async (_label, value) => {
    const { parseStoreWhatsAppNumber } = await import('@/config/store')
    expect(parseStoreWhatsAppNumber(value)).toBeNull()
  })
})

describe('STORE_WHATSAPP_NUMBER e buildWhatsAppUrl', () => {
  it('número válido: gera o link de contato e o link com mensagem', async () => {
    await withNumber(VALID_13)
    const { STORE_WHATSAPP_NUMBER } = await import('@/config/store')
    const { buildWhatsAppUrl } = await import('./whatsapp')
    expect(STORE_WHATSAPP_NUMBER).toBe(VALID_13)
    expect(buildWhatsAppUrl()).toBe(`https://wa.me/${VALID_13}`)
    expect(buildWhatsAppUrl('Oi & tchau')).toBe(`https://wa.me/${VALID_13}?text=Oi%20%26%20tchau`)
  })

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['inválido', '+55 21 98765-4321'],
  ])('número %s: STORE_WHATSAPP_NUMBER = null e nenhuma URL wa.me', async (_label, value) => {
    await withNumber(value)
    const { STORE_WHATSAPP_NUMBER } = await import('@/config/store')
    const { buildWhatsAppUrl } = await import('./whatsapp')
    expect(STORE_WHATSAPP_NUMBER).toBeNull()
    expect(buildWhatsAppUrl()).toBeNull()
    expect(buildWhatsAppUrl('mensagem')).toBeNull()
  })
})

/** Renderiza os cinco pontos de contato com os módulos já recarregados. */
async function renderContactPoints(): Promise<Record<string, string>> {
  const { default: WhatsAppButton } = await import('@/components/WhatsAppButton')
  const { default: Footer } = await import('@/components/Footer')
  const { default: CartView } = await import('@/components/CartView')
  const { default: CartDrawer } = await import('@/components/CartDrawer')
  const { default: ProductDetailView } = await import('@/components/ProductDetailView')
  return {
    botão: renderToStaticMarkup(<WhatsAppButton />),
    rodapé: renderToStaticMarkup(<Footer categories={[]} />),
    sacola: renderToStaticMarkup(<CartView />),
    gaveta: renderToStaticMarkup(<CartDrawer />),
    produto: renderToStaticMarkup(<ProductDetailView product={product} related={[]} />),
  }
}

describe('pontos de contato por WhatsApp', () => {
  it('sem número: nenhum dos cinco pontos mostra o link de WhatsApp', async () => {
    await withNumber(undefined)
    const html = await renderContactPoints()

    expect(html.botão).toBe('')
    for (const [where, markup] of Object.entries(html)) {
      expect(markup, where).not.toContain('wa.me')
    }
    expect(html.rodapé).not.toContain('Fale conosco no WhatsApp')
    expect(html.sacola).not.toContain('Finalizar pelo WhatsApp')
    expect(html.gaveta).not.toContain('Finalizar no WhatsApp')
    expect(html.produto).not.toContain('Prefere comprar pelo WhatsApp?')
    // O resto da página continua lá — checkout e sacola não dependem do WhatsApp.
    expect(html.sacola).toContain('Ir para o checkout')
    expect(html.gaveta).toContain('Finalizar compra')
    expect(html.produto).toContain('Adicionar à sacola')
    expect(html.rodapé).toContain('Todos os produtos')
  })

  it('número inválido: mesmo comportamento de ausente', async () => {
    await withNumber('5511')
    const html = await renderContactPoints()
    for (const [where, markup] of Object.entries(html)) {
      expect(markup, where).not.toContain('wa.me')
    }
  })

  it('número válido: os cinco pontos mostram o link wa.me', async () => {
    await withNumber(VALID_13)
    const html = await renderContactPoints()
    for (const [where, markup] of Object.entries(html)) {
      expect(markup, where).toContain(`https://wa.me/${VALID_13}`)
    }
    expect(html.sacola).toContain('Finalizar pelo WhatsApp')
    expect(html.gaveta).toContain('Finalizar no WhatsApp')
    expect(html.produto).toContain('Prefere comprar pelo WhatsApp?')
    expect(html.rodapé).toContain('Fale conosco no WhatsApp')
  })
})

describe('rodapé: menção "Atendimento pelo WhatsApp"', () => {
  async function renderFooter() {
    const { default: Footer } = await import('@/components/Footer')
    return renderToStaticMarkup(<Footer categories={[]} />)
  }

  it('sem número válido: o texto não aparece (e nada mais menciona WhatsApp)', async () => {
    await withNumber(undefined)
    const html = await renderFooter()
    expect(html).not.toContain('Atendimento pelo WhatsApp')
    expect(html).not.toMatch(/WhatsApp/)
    // Os demais itens de "Como funciona" continuam.
    expect(html).toContain('Frete calculado no checkout')
  })

  it('com número válido: o texto aparece, como antes', async () => {
    await withNumber(VALID_13)
    const html = await renderFooter()
    expect(html).toContain('Atendimento pelo WhatsApp')
    expect(html).toContain('Frete calculado no checkout')
  })
})

describe('sem número fictício nem URL wa.me fora de buildWhatsAppUrl', () => {
  const SRC = join(__dirname, '..')
  const THIS_FILE = relative(SRC, __filename)

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  }
  const sources = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

  it('o placeholder 5511999999999 não existe no código da loja', () => {
    const offenders = sources
      .filter((f) => !f.includes(`${sep}whatsapp${sep}`)) // exemplos de E.164 da API de notificações
      .filter((f) => readFileSync(f, 'utf8').includes('5511999999999'))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it('"wa.me" só aparece em src/lib/whatsapp.ts', () => {
    const offenders = sources
      .filter((f) => relative(SRC, f) !== THIS_FILE)
      .filter((f) => readFileSync(f, 'utf8').includes('wa.me'))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([['lib', 'whatsapp.ts'].join(sep)])
  })
})
