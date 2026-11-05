'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signOut } from '@/auth'
import { isSameOrigin } from '@/lib/same-origin'
import { ForbiddenError, lookupStaff } from '@/server/guard'

// Encerramento de sessão do painel — SOMENTE por POST (Server Action).
// - Server Actions só aceitam POST e o Next confere `Origin` × host;
// - além disso, `assertSameOrigin` repete a conferência explicitamente;
// - não existe rota GET que encerre a sessão (um link externo não desloga ninguém).

async function assertSameOrigin(): Promise<void> {
  const h = await headers()
  if (!isSameOrigin(h.get('origin'), h.get('x-forwarded-host'), h.get('host'))) {
    throw new ForbiddenError('Origem da requisição inválida.')
  }
}

/** Botão "Sair" do cabeçalho do painel: encerra a sessão de quem pediu. */
export async function signOutAction(): Promise<void> {
  await assertSameOrigin()
  await signOut({ redirectTo: '/admin/login' })
}

/**
 * Usado só por /admin/sessao-encerrada. Encerra a sessão APENAS se o usuário perdeu
 * o acesso (inexistente, inativo ou sem papel de equipe — conferido no banco agora).
 * Usuário ainda autorizado vai para o painel; sem sessão, para o login.
 */
export async function endRevokedSessionAction(): Promise<void> {
  await assertSameOrigin()
  const result = await lookupStaff()
  if (result.kind === 'ok') redirect('/admin')
  if (result.kind === 'unauthenticated') redirect('/admin/login')
  await signOut({ redirectTo: '/admin/login?acesso=encerrado' })
}
