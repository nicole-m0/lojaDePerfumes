import { describe, expect, it } from 'vitest'
import { can, isStaffRole, type Permission, type RoleValue } from '@/lib/roles'

// Matriz aprovada (Etapa 1).
const MATRIX: Record<RoleValue, Record<Permission, boolean>> = {
  OWNER: { panel: true, finance: true, productCost: true, paymentReverse: true },
  ADMIN: { panel: true, finance: true, productCost: true, paymentReverse: false },
  STAFF: { panel: true, finance: false, productCost: false, paymentReverse: false },
  CUSTOMER: { panel: false, finance: false, productCost: false, paymentReverse: false },
}

describe('roles', () => {
  for (const [role, perms] of Object.entries(MATRIX)) {
    for (const [perm, expected] of Object.entries(perms)) {
      it(`${role} ${expected ? 'pode' : 'não pode'} ${perm}`, () => {
        expect(can(role, perm as Permission)).toBe(expected)
      })
    }
  }

  it('isStaffRole aceita só OWNER, ADMIN e STAFF', () => {
    expect(['OWNER', 'ADMIN', 'STAFF'].every(isStaffRole)).toBe(true)
    expect(isStaffRole('CUSTOMER')).toBe(false)
    expect(isStaffRole('owner')).toBe(false)
    expect(isStaffRole(undefined)).toBe(false)
    expect(isStaffRole(null)).toBe(false)
  })

  it('valores desconhecidos não têm nenhuma permissão', () => {
    for (const perm of ['panel', 'finance', 'productCost', 'paymentReverse'] as Permission[]) {
      expect(can('SUPERUSER', perm)).toBe(false)
      expect(can(undefined, perm)).toBe(false)
    }
  })
})
