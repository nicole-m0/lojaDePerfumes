import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '@/lib/same-origin'

describe('isSameOrigin', () => {
  it('aceita origem igual ao host', () => {
    expect(isSameOrigin('http://localhost:3000', null, 'localhost:3000')).toBe(true)
    expect(isSameOrigin('https://loja.vercel.app', null, 'LOJA.vercel.app')).toBe(true)
  })

  it('atrás de proxy, compara com x-forwarded-host (primeiro da lista)', () => {
    expect(isSameOrigin('https://loja.vercel.app', 'loja.vercel.app', 'interno:3000')).toBe(true)
    expect(isSameOrigin('https://loja.vercel.app', 'loja.vercel.app, proxy', 'x')).toBe(true)
    expect(isSameOrigin('https://interno:3000', 'loja.vercel.app', 'interno:3000')).toBe(false)
  })

  it('recusa outro site, outra porta e subdomínio', () => {
    expect(isSameOrigin('https://atacante.com', null, 'loja.vercel.app')).toBe(false)
    expect(isSameOrigin('http://localhost:4000', null, 'localhost:3000')).toBe(false)
    expect(isSameOrigin('https://x.loja.vercel.app', null, 'loja.vercel.app')).toBe(false)
  })

  it('recusa Origin ausente, "null" ou malformado, e host ausente', () => {
    expect(isSameOrigin(null, null, 'localhost:3000')).toBe(false)
    expect(isSameOrigin('null', null, 'localhost:3000')).toBe(false)
    expect(isSameOrigin('não é url', null, 'localhost:3000')).toBe(false)
    expect(isSameOrigin('http://localhost:3000', null, null)).toBe(false)
  })
})
