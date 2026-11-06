import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

// O Vitest compila JSX no modo clássico (React.createElement): expõe o React global.
;(globalThis as { React?: typeof React }).React = React

// GET em /admin/sessao-encerrada nunca encerra a sessão: usuário válido vai ao painel,
// sem sessão vai ao login; só quem perdeu o acesso vê o formulário (POST).

const h = vi.hoisted(() => ({ lookup: { kind: 'forbidden' } as { kind: string } }))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/server/guard', () => ({ lookupStaff: async () => h.lookup }))
vi.mock('@/server/session-actions', () => ({ endRevokedSessionAction: vi.fn() }))
vi.mock('@/auth', () => ({ signOut: vi.fn(), auth: vi.fn() }))

import RevokedSessionPage from '@/app/(admin)/admin/sessao-encerrada/page'
import { signOut } from '@/auth'

describe('/admin/sessao-encerrada (GET)', () => {
  it('usuário autorizado → painel (link externo não desloga ninguém)', async () => {
    h.lookup = { kind: 'ok' }
    await expect(RevokedSessionPage()).rejects.toThrow('REDIRECT:/admin')
  })

  it('sem sessão → login', async () => {
    h.lookup = { kind: 'unauthenticated' }
    await expect(RevokedSessionPage()).rejects.toThrow('REDIRECT:/admin/login')
  })

  it('usuário sem acesso → renderiza o aviso; a página em si não chama signOut', async () => {
    h.lookup = { kind: 'forbidden' }
    await expect(RevokedSessionPage()).resolves.toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })
})
