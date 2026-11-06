import { describe, expect, it } from 'vitest'
import {
  enumerateDays,
  isPeriodPreset,
  resolveDateRange,
  resolvePeriodPreset,
  toDayKey,
} from './date-range'

const FIXED_NOW = new Date(2026, 7, 30, 15, 30, 0) // 2026-08-30 15:30 local

describe('resolvePeriodPreset / isPeriodPreset', () => {
  it('aceita somente os presets válidos', () => {
    expect(isPeriodPreset('today')).toBe(true)
    expect(isPeriodPreset('7d')).toBe(true)
    expect(isPeriodPreset('30d')).toBe(true)
    expect(isPeriodPreset('month')).toBe(true)
    expect(isPeriodPreset('1y')).toBe(false)
    expect(isPeriodPreset(undefined)).toBe(false)
  })

  it('cai no default (7d) para valor inválido ou ausente', () => {
    expect(resolvePeriodPreset('xyz')).toBe('7d')
    expect(resolvePeriodPreset(undefined)).toBe('7d')
    expect(resolvePeriodPreset('month')).toBe('month')
  })
})

describe('resolveDateRange', () => {
  it('today cobre só o dia atual, do início do dia até agora', () => {
    const { from, to } = resolveDateRange('today', FIXED_NOW)
    expect(from).toEqual(new Date(2026, 7, 30, 0, 0, 0))
    expect(to).toEqual(FIXED_NOW)
  })

  it('7d cobre os últimos 7 dias corridos (hoje incluso)', () => {
    const { from, to } = resolveDateRange('7d', FIXED_NOW)
    expect(from).toEqual(new Date(2026, 7, 24, 0, 0, 0))
    expect(to).toEqual(FIXED_NOW)
  })

  it('30d cobre os últimos 30 dias corridos (hoje incluso)', () => {
    const { from } = resolveDateRange('30d', FIXED_NOW)
    expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0))
  })

  it('month cobre do dia 1 do mês corrente até agora', () => {
    const { from, to } = resolveDateRange('month', FIXED_NOW)
    expect(from).toEqual(new Date(2026, 7, 1, 0, 0, 0))
    expect(to).toEqual(FIXED_NOW)
  })
})

describe('enumerateDays / toDayKey', () => {
  it('enumera cada dia do intervalo em YYYY-MM-DD', () => {
    const range = resolveDateRange('today', FIXED_NOW)
    expect(enumerateDays(range)).toEqual(['2026-08-30'])
  })

  it('enumera múltiplos dias para 7d', () => {
    const range = resolveDateRange('7d', FIXED_NOW)
    const days = enumerateDays(range)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-08-24')
    expect(days[6]).toBe('2026-08-30')
  })

  it('toDayKey formata com zero à esquerda', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
