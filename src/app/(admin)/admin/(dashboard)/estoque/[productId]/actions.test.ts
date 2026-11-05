import { beforeEach, describe, expect, it, vi } from 'vitest'

// Entrada manual de estoque: "Devolução de cliente" (CUSTOMER_RETURN) não é mais
// aceita — devolução de pedido só pelo retorno físico na página do pedido.

const h = vi.hoisted(() => ({ registerManualEntry: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/guard', () => ({
  requireStaff: async () => ({ id: 'u1', email: 'u1@x.dev', name: null, role: 'STAFF' }),
}))
vi.mock('@/server/stock', () => ({
  getProductForStock: async () => ({ id: 'p1', name: 'A', stockOnHand: 3, status: 'ACTIVE' }),
  registerManualEntry: h.registerManualEntry,
  registerManualExit: vi.fn(),
  adjustStockToQuantity: vi.fn(),
  InsufficientStockError: class extends Error {},
}))

import { registerStockEntry } from '@/app/(admin)/admin/(dashboard)/estoque/[productId]/actions'

const entry = (reason: string) => {
  const fd = new FormData()
  fd.set('productId', 'p1')
  fd.set('reason', reason)
  fd.set('quantity', '2')
  return registerStockEntry({}, fd)
}

beforeEach(() => h.registerManualEntry.mockReset())

describe('registerStockEntry — motivos', () => {
  it('recusa CUSTOMER_RETURN e não grava nada', async () => {
    const result = await entry('CUSTOMER_RETURN')
    expect(result.error).toMatch(/página do pedido/)
    expect(h.registerManualEntry).not.toHaveBeenCalled()
  })

  it.each(['PURCHASE', 'INVENTORY_COUNT', 'OTHER'])('aceita %s', async (reason) => {
    await expect(entry(reason)).resolves.toEqual({ ok: true })
    expect(h.registerManualEntry).toHaveBeenCalledWith(expect.objectContaining({ reason, quantity: 2, userId: 'u1' }))
  })
})
