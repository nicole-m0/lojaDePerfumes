import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('remove acentos e normaliza separadores', () => {
    expect(slugify('Perfumes Femininos')).toBe('perfumes-femininos')
    expect(slugify('Skincare, protetor solares')).toBe('skincare-protetor-solares')
    expect(slugify('  Óculos & Acessórios!  ')).toBe('oculos-acessorios')
    expect(slugify('Quem Disse, Berenice?')).toBe('quem-disse-berenice')
  })
})
