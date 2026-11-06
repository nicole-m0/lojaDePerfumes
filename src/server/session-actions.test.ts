import { beforeEach, describe, expect, it, vi } from 'vitest'

// Logout do painel: só por POST (Server Action), com conferência de origem. A sessão
// revogada só é encerrada se o usuário perdeu mesmo o acesso; usuário válido que
// chegue à página por um link externo não é deslogado.

const h = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  lookup: { kind: 'forbidden' } as { kind: string; user?: unknown },
  signOut: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => h.headers.get(k) ?? null }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/auth', () => ({ signOut: h.signOut }))
vi.mock('@/server/guard', () => {
  class ForbiddenError extends Error {}
  return { ForbiddenError, lookupStaff: async () => h.lookup }
})

import { endRevokedSessionAction, signOutAction } from '@/server/session-actions'
import { ForbiddenError } from '@/server/guard'

const sameOrigin = () => {
  h.headers = new Map([
    ['origin', 'http://localhost:3000'],
    ['host', 'localhost:3000'],
  ])
}

beforeEach(() => {
  sameOrigin()
  h.lookup = { kind: 'forbidden' }
  h.signOut.mockReset()
})

describe('signOutAction (botão Sair)', () => {
  it('mesma origem → encerra a sessão', async () => {
    await signOutAction()
    expect(h.signOut).toHaveBeenCalledWith({ redirectTo: '/admin/login' })
  })

  it.each([
    ['outro site', [['origin', 'https://atacante.com'], ['host', 'localhost:3000']]],
    ['sem Origin', [['host', 'localhost:3000']]],
  ])('%s → recusa e NÃO encerra', async (_l, entries) => {
    h.headers = new Map(entries as [string, string][])
    await expect(signOutAction()).rejects.toBeInstanceOf(ForbiddenError)
    expect(h.signOut).not.toHaveBeenCalled()
  })
})

describe('endRevokedSessionAction (/admin/sessao-encerrada)', () => {
  it('usuário que perdeu o acesso → encerra a sessão e vai ao login com aviso', async () => {
    await endRevokedSessionAction()
    expect(h.signOut).toHaveBeenCalledWith({ redirectTo: '/admin/login?acesso=encerrado' })
  })

  it('usuário ainda autorizado → vai ao painel, sessão mantida', async () => {
    h.lookup = { kind: 'ok', user: {} }
    await expect(endRevokedSessionAction()).rejects.toThrow('REDIRECT:/admin')
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('sem sessão → login, nada a encerrar', async () => {
    h.lookup = { kind: 'unauthenticated' }
    await expect(endRevokedSessionAction()).rejects.toThrow('REDIRECT:/admin/login')
    expect(h.signOut).not.toHaveBeenCalled()
  })

  it('origem externa → recusa antes de qualquer coisa', async () => {
    h.headers = new Map([
      ['origin', 'https://atacante.com'],
      ['host', 'localhost:3000'],
    ])
    await expect(endRevokedSessionAction()).rejects.toBeInstanceOf(ForbiddenError)
    expect(h.signOut).not.toHaveBeenCalled()
  })
})
