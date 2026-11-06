import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// guard.ts: papel e `isActive` SEMPRE lidos do banco; sessão só identifica.
// `react.cache` é simulado como memo por "requisição" (zerado no beforeEach) para
// provar que layout + página + Promise.all dividem UMA consulta.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  session: null as null | { user?: { id?: string; email?: string; role?: string } },
  users: [] as { id: string; email: string; name: string | null; role: string; isActive: boolean }[],
  findUnique: vi.fn(),
  memo: [] as (() => void)[],
}))

vi.mock('server-only', () => ({}))
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>()
  return {
    ...actual,
    cache: <T,>(fn: () => Promise<T>) => {
      let p: Promise<T> | undefined
      h.memo.push(() => (p = undefined))
      return () => (p ??= fn())
    },
  }
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.findUnique } } }))

import {
  ForbiddenError,
  requireStaff,
  requireStaffPage,
  UnauthenticatedError,
} from '@/server/guard'

function newRequest() {
  for (const reset of h.memo) reset()
}

beforeEach(() => {
  newRequest()
  h.session = null
  h.users = [
    { id: 'u_owner', email: 'owner@x.dev', name: 'Dona', role: 'OWNER', isActive: true },
    { id: 'u_admin', email: 'admin@x.dev', name: null, role: 'ADMIN', isActive: true },
    { id: 'u_staff', email: 'staff@x.dev', name: null, role: 'STAFF', isActive: true },
    { id: 'u_off', email: 'off@x.dev', name: null, role: 'OWNER', isActive: false },
    { id: 'u_cust', email: 'cust@x.dev', name: null, role: 'CUSTOMER', isActive: true },
  ]
  h.findUnique.mockReset()
  h.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) => {
    const u = h.users.find((x) => (where.id ? x.id === where.id : x.email === where.email))
    return u ? { ...u } : null
  })
})

const loginAs = (id: string, extra: Record<string, string> = {}) => {
  const u = h.users.find((x) => x.id === id)!
  h.session = { user: { id, email: u.email, ...extra } }
}

describe('requireStaff (Server Actions e APIs)', () => {
  it('sem sessão → UnauthenticatedError, sem consultar o banco', async () => {
    await expect(requireStaff()).rejects.toBeInstanceOf(UnauthenticatedError)
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it.each(['u_owner', 'u_admin', 'u_staff'])('%s ativo entra no painel', async (id) => {
    loginAs(id)
    await expect(requireStaff()).resolves.toMatchObject({ id })
  })

  it.each([
    ['inativo', 'u_off'],
    ['CUSTOMER', 'u_cust'],
  ])('%s → ForbiddenError', async (_label, id) => {
    loginAs(id)
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('usuário removido do banco → ForbiddenError', async () => {
    h.session = { user: { id: 'u_gone', email: 'gone@x.dev' } }
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('STAFF não tem finance nem productCost; ADMIN não tem paymentReverse', async () => {
    loginAs('u_staff')
    await expect(requireStaff('finance')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requireStaff('productCost')).rejects.toBeInstanceOf(ForbiddenError)
    newRequest()
    loginAs('u_admin')
    await expect(requireStaff('finance')).resolves.toMatchObject({ role: 'ADMIN' })
    await expect(requireStaff('paymentReverse')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('consulta o banco mesmo com id na sessão (não confia só no token)', async () => {
    loginAs('u_staff')
    await requireStaff()
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u_staff' } }))
  })

  it('sem id na sessão, identifica pelo e-mail', async () => {
    h.session = { user: { email: 'admin@x.dev' } }
    await expect(requireStaff()).resolves.toMatchObject({ id: 'u_admin' })
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'admin@x.dev' } }))
  })

  it('o papel do BANCO prevalece sobre o do token (OWNER rebaixado a STAFF)', async () => {
    h.users.find((u) => u.id === 'u_owner')!.role = 'STAFF'
    loginAs('u_owner', { role: 'OWNER' })
    const staff = await requireStaff()
    expect(staff.role).toBe('STAFF')
    await expect(requireStaff('paymentReverse')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('desativado no meio da sessão perde o acesso na próxima requisição', async () => {
    loginAs('u_staff')
    await expect(requireStaff()).resolves.toBeTruthy()
    h.users.find((u) => u.id === 'u_staff')!.isActive = false
    newRequest()
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('requireStaffPage (páginas e layout)', () => {
  it('sem sessão → login', async () => {
    await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/admin/login')
  })

  it.each(['u_off', 'u_cust'])('%s → /admin/sessao-encerrada (encerra por POST, sem ciclo com o middleware)', async (id) => {
    loginAs(id)
    await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/admin/sessao-encerrada')
  })

  it('STAFF numa página de finance → painel com aviso, sem encerrar a sessão', async () => {
    loginAs('u_staff')
    await expect(requireStaffPage('finance')).rejects.toThrow('REDIRECT:/admin?acesso=negado')
  })

  it('layout + página + Promise.all na mesma requisição → UMA consulta ao banco', async () => {
    loginAs('u_admin')
    await requireStaffPage() // layout
    await requireStaffPage('finance') // página
    await Promise.all([requireStaff(), requireStaff('finance')])
    expect(h.findUnique).toHaveBeenCalledTimes(1)
  })
})
