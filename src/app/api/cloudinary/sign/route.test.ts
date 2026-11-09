import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  user: null as null | { id: string; email: string; name: null; role: string; isActive: boolean },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/auth', () => ({ auth: async () => h.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: async () => h.user } } }))
vi.mock('@/lib/cloudinary', () => ({
  cloudinaryConfigured: true,
  cloudinary: { utils: { api_sign_request: () => 'assinatura' } },
}))

import { POST } from '@/app/api/cloudinary/sign/route'

const req = () =>
  new Request('http://localhost/api/cloudinary/sign', {
    method: 'POST',
    body: JSON.stringify({ paramsToSign: { timestamp: 1 } }),
  })

beforeEach(() => {
  h.session = { user: { id: 'u1', email: 'u1@x.dev' } }
  h.user = { id: 'u1', email: 'u1@x.dev', name: null, role: 'STAFF', isActive: true }
})

describe('POST /api/cloudinary/sign', () => {
  it('sem sessão → 401', async () => {
    h.session = null
    expect((await POST(req())).status).toBe(401)
  })

  it('CUSTOMER → 403', async () => {
    h.user!.role = 'CUSTOMER'
    expect((await POST(req())).status).toBe(403)
  })

  it('usuário inativo → 403', async () => {
    h.user!.isActive = false
    expect((await POST(req())).status).toBe(403)
  })

  it('STAFF ativo → 200 com assinatura', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signature: 'assinatura' })
  })
})
