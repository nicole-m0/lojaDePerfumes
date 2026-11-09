import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'

const h = vi.hoisted(() => ({ users: [] as Record<string, unknown>[] }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        h.users.find((u) => u.email === where.email) ?? null,
    },
  },
}))

import { verifyStaffCredentials } from '@/server/credentials'

let hash: string
beforeAll(async () => {
  hash = await bcrypt.hash('senha-correta-123', 4)
})

const user = (email: string, role: string, isActive = true) => ({
  id: `id_${email}`,
  email,
  name: null,
  image: null,
  role,
  isActive,
  passwordHash: hash,
})

beforeEach(() => {
  h.users = [
    user('owner@x.dev', 'OWNER'),
    user('admin@x.dev', 'ADMIN'),
    user('staff@x.dev', 'STAFF'),
    user('cust@x.dev', 'CUSTOMER'),
    user('off@x.dev', 'STAFF', false),
  ]
})

describe('verifyStaffCredentials (login do painel)', () => {
  it.each(['owner@x.dev', 'admin@x.dev', 'staff@x.dev'])('%s com senha correta entra', async (email) => {
    await expect(verifyStaffCredentials({ email, password: 'senha-correta-123' })).resolves.toMatchObject({ email })
  })

  it('CUSTOMER não recebe sessão, mesmo com a senha correta', async () => {
    await expect(verifyStaffCredentials({ email: 'cust@x.dev', password: 'senha-correta-123' })).resolves.toBeNull()
  })

  it('usuário inativo não recebe sessão', async () => {
    await expect(verifyStaffCredentials({ email: 'off@x.dev', password: 'senha-correta-123' })).resolves.toBeNull()
  })

  it('senha errada, e-mail inexistente ou dados malformados → null', async () => {
    await expect(verifyStaffCredentials({ email: 'staff@x.dev', password: 'errada' })).resolves.toBeNull()
    await expect(verifyStaffCredentials({ email: 'nada@x.dev', password: 'senha-correta-123' })).resolves.toBeNull()
    await expect(verifyStaffCredentials({ email: 'não-é-email', password: 'x' })).resolves.toBeNull()
    await expect(verifyStaffCredentials(null)).resolves.toBeNull()
  })
})
