import { describe, expect, it } from 'vitest'
import { formatZip, isValidZip, normalizeZip } from './cep'

describe('normalizeZip', () => {
  it('remove tudo que não é dígito', () => {
    expect(normalizeZip('01001-000')).toBe('01001000')
    expect(normalizeZip(' 01001 000 ')).toBe('01001000')
    expect(normalizeZip('CEP: 01001-000')).toBe('01001000')
  })

  it('trata null/undefined como string vazia', () => {
    expect(normalizeZip(null)).toBe('')
    expect(normalizeZip(undefined)).toBe('')
  })
})

describe('isValidZip', () => {
  it('exige exatamente 8 dígitos', () => {
    expect(isValidZip('01001000')).toBe(true)
    expect(isValidZip('01001-000')).toBe(true)
    expect(isValidZip('0100100')).toBe(false)
    expect(isValidZip('010010000')).toBe(false)
    expect(isValidZip('')).toBe(false)
    expect(isValidZip(null)).toBe(false)
  })
})

describe('formatZip', () => {
  it('formata quando há 8 dígitos', () => {
    expect(formatZip('01001000')).toBe('01001-000')
  })
  it('devolve os dígitos crus quando não há 8', () => {
    expect(formatZip('0100')).toBe('0100')
  })
})
