import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const SRC = join(__dirname, '..')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('nome da loja', () => {
  it('default do código é Bella&Cheirosa (quando a env não está definida)', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORE_NAME', '')
    const { STORE_NAME } = await import('@/config/store')
    expect(STORE_NAME).toBe('Bella&Cheirosa')
  })

  it('mensagens de WhatsApp usam o nome configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORE_NAME', '')
    const { buildCartMessage, buildProductMessage, buildWhatsAppUrl } = await import('./whatsapp')
    const product = { id: 'p', name: 'Perfume X', price: 10 } as never
    expect(buildCartMessage([{ product, quantity: 1 }], 10)).toContain('Bella&Cheirosa')
    expect(buildProductMessage(product, 1)).toContain('Bella&Cheirosa')
    // O "&" do nome não pode quebrar a query string do wa.me.
    expect(buildWhatsAppUrl('Bella&Cheirosa')).toContain('text=Bella%26Cheirosa')
  })

  it('título do pedido no Mercado Pago usa o nome da loja', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORE_NAME', '')
    const { buildPreferencePayload } = await import('./mercadopago')
    const p = buildPreferencePayload({
      orderId: 'o',
      orderNumber: 3,
      totalCents: 100,
      currency: 'BRL',
    })
    expect(p.items[0].title).toBe('Pedido #3 — Bella&Cheirosa')
  })
})

describe('sem referências à identidade antiga', () => {
  // Únicos lugares autorizados: chaves de compatibilidade (carrinho e cookie),
  // que precisam do nome antigo para migrar/ler dados de visitantes.
  const ALLOWED = new Set([
    ['lib', 'cart-storage.ts'].join(sep),
    ['lib', 'cart-storage.test.ts'].join(sep),
    ['app', '(shop)', 'checkout', 'actions.ts'].join(sep),
    ['lib', 'brand.test.ts'].join(sep),
  ])

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  }

  it('nenhum arquivo de src/ menciona "Vênus"/"venus" fora das chaves legadas', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(tsx?|css|svg|json)$/.test(f))
      .filter((f) => !ALLOWED.has(relative(SRC, f)))
      .filter((f) => /v[eê]nus/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it('nenhum arquivo de src/ cita as marcas reais do catálogo antigo', () => {
    // A lista completa de nomes proibidos vive no teste do catálogo (único autorizado).
    const denylistFile = ['data', 'demo-catalog.test.ts'].join(sep)
    const offenders = walk(SRC)
      .filter((f) => /\.(tsx?|css|svg|json)$/.test(f))
      .filter((f) => relative(SRC, f) !== denylistFile && relative(SRC, f) !== ['lib', 'brand.test.ts'].join(sep))
      .filter((f) => /\b(avon|botic[aá]rio|natura|hinode|berenice|blossom)\b/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })
})
