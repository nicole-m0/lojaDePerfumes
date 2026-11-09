import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('remove acentos e normaliza separadores', () => {
    expect(slugify('Perfumes Femininos')).toBe('perfumes-femininos')
    expect(slugify('Skincare, protetor solares')).toBe('skincare-protetor-solares')
    expect(slugify('  Óculos & Acessórios!  ')).toBe('oculos-acessorios')
    expect(slugify('Tabaco & Mel, Nº 1?')).toBe('tabaco-mel-n-1')
    expect(slugify('Ateliê Bella&Cheirosa')).toBe('atelie-bella-cheirosa')
  })
})
