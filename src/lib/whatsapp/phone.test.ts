import { describe, expect, it } from 'vitest'
import { normalizePhoneToE164 } from './phone'

describe('normalizePhoneToE164', () => {
  it('celular com máscara completa', () => {
    expect(normalizePhoneToE164('(11) 99999-9999')).toBe('+5511999999999')
  })

  it('celular sem máscara', () => {
    expect(normalizePhoneToE164('11999999999')).toBe('+5511999999999')
  })

  it('já vem com +55', () => {
    expect(normalizePhoneToE164('+5511999999999')).toBe('+5511999999999')
  })

  it('vem com 55 mas sem o "+"', () => {
    expect(normalizePhoneToE164('5511999999999')).toBe('+5511999999999')
  })

  it('formatos com espaços, parênteses e hífens variados', () => {
    expect(normalizePhoneToE164('+55 (11) 99999-9999')).toBe('+5511999999999')
    expect(normalizePhoneToE164('55 11 99999 9999')).toBe('+5511999999999')
    expect(normalizePhoneToE164('  11 9 9999-9999  ')).toBe('+5511999999999')
  })

  it('telefone fixo válido (8 dígitos, sem e com +55)', () => {
    expect(normalizePhoneToE164('(11) 3333-4444')).toBe('+551133334444')
    expect(normalizePhoneToE164('+551133334444')).toBe('+551133334444')
  })

  it('DDD 55 (Rio Grande do Sul) não é confundido com código do país', () => {
    expect(normalizePhoneToE164('55999999999')).toBe('+5555999999999')
    expect(normalizePhoneToE164('(55) 99999-9999')).toBe('+5555999999999')
  })

  it('rejeita celular com dígito de nono lugar errado (não começa em 9)', () => {
    expect(normalizePhoneToE164('11888888888')).toBeNull()
  })

  it('rejeita fixo com primeiro dígito fora de 2-5', () => {
    expect(normalizePhoneToE164('1111112222')).toBeNull()
  })

  it('rejeita DDD inválido (começando em 0)', () => {
    expect(normalizePhoneToE164('0800123456')).toBeNull()
    expect(normalizePhoneToE164('01999999999')).toBeNull()
  })

  it('rejeita números curtos ou longos demais', () => {
    expect(normalizePhoneToE164('123456')).toBeNull()
    expect(normalizePhoneToE164('119999999999999')).toBeNull()
  })

  it('rejeita string com "55" mas comprimento total incorreto', () => {
    expect(normalizePhoneToE164('551199999999')).toBeNull() // 12 dígitos, mas sobra landline de 10 c/ 9 no início
  })

  it('rejeita entradas vazias ou ausentes', () => {
    expect(normalizePhoneToE164('')).toBeNull()
    expect(normalizePhoneToE164('   ')).toBeNull()
    expect(normalizePhoneToE164(null)).toBeNull()
    expect(normalizePhoneToE164(undefined)).toBeNull()
  })

  it('rejeita texto sem dígitos suficientes', () => {
    expect(normalizePhoneToE164('não informado')).toBeNull()
  })
})
