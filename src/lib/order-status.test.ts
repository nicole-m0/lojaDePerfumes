import { describe, expect, it } from 'vitest'
import {
  canCancel,
  canTransition,
  forwardStatuses,
  nextStatuses,
} from './order-status'

describe('máquina de estados do pedido', () => {
  it('segue o fluxo linear aprovado', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true)
    expect(canTransition('CONFIRMED', 'PROCESSING')).toBe(true)
    expect(canTransition('PROCESSING', 'SHIPPED')).toBe(true)
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true)
  })

  it('não permite pular etapas nem voltar', () => {
    expect(canTransition('PENDING', 'SHIPPED')).toBe(false)
    expect(canTransition('PENDING', 'DELIVERED')).toBe(false)
    expect(canTransition('SHIPPED', 'PROCESSING')).toBe(false)
    expect(canTransition('CONFIRMED', 'PENDING')).toBe(false)
  })

  it('permite cancelar de PENDING/CONFIRMED/PROCESSING/SHIPPED', () => {
    expect(canCancel('PENDING')).toBe(true)
    expect(canCancel('CONFIRMED')).toBe(true)
    expect(canCancel('PROCESSING')).toBe(true)
    expect(canCancel('SHIPPED')).toBe(true)
  })

  it('não permite cancelar pedido entregue nem transição a partir de terminais', () => {
    expect(canCancel('DELIVERED')).toBe(false)
    expect(canTransition('DELIVERED', 'CANCELED')).toBe(false)
    expect(nextStatuses('DELIVERED')).toEqual([])
    expect(nextStatuses('CANCELED')).toEqual([])
  })

  it('forwardStatuses exclui CANCELED', () => {
    expect(forwardStatuses('PROCESSING')).toEqual(['SHIPPED'])
    expect(forwardStatuses('SHIPPED')).toEqual(['DELIVERED'])
    expect(forwardStatuses('DELIVERED')).toEqual([])
  })
})
