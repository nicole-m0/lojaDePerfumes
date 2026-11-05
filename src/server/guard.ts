import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { can, isStaffRole, type Permission } from '@/lib/roles'

export interface StaffUser {
  id: string
  email: string
  name: string | null
  /** Papel lido do BANCO a cada requisição — nunca o do token da sessão. */
  role: Role
}

/** Sem sessão válida. */
export class UnauthenticatedError extends Error {
  constructor() {
    super('Não autenticado.')
  }
}

/** Sessão válida, mas usuário inexistente, inativo, sem papel de equipe ou sem a permissão. */
export class ForbiddenError extends Error {
  constructor(message = 'Usuário não autorizado.') {
    super(message)
  }
}

export type StaffLookup =
  | { kind: 'ok'; user: StaffUser }
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }

/**
 * Resolve o usuário da sessão no BANCO: existe, está ativo e tem papel de equipe.
 *
 * `cache` (React) faz layout, página e `Promise.all` da MESMA requisição dividirem
 * uma única consulta. Cada Server Action é uma requisição própria → uma consulta.
 */
export const lookupStaff = cache(async (): Promise<StaffLookup> => {
  const session = await auth()
  const id = session?.user?.id
  const email = session?.user?.email
  if (!id && !email) return { kind: 'unauthenticated' }

  const select = { id: true, email: true, name: true, role: true, isActive: true } as const
  const user = id
    ? await prisma.user.findUnique({ where: { id }, select })
    : await prisma.user.findUnique({ where: { email: email! }, select })

  if (!user || !user.isActive || !isStaffRole(user.role)) return { kind: 'forbidden' }
  return { kind: 'ok', user: { id: user.id, email: user.email, name: user.name, role: user.role } }
})

/**
 * Para Server Actions e rotas de API: exige usuário de equipe ativo com a permissão
 * pedida. Lança `UnauthenticatedError` / `ForbiddenError` — nunca redireciona.
 */
export async function requireStaff(permission: Permission = 'panel'): Promise<StaffUser> {
  const result = await lookupStaff()
  if (result.kind === 'unauthenticated') throw new UnauthenticatedError()
  if (result.kind === 'forbidden') throw new ForbiddenError()
  if (!can(result.user.role, permission)) {
    throw new ForbiddenError('Você não tem permissão para esta operação.')
  }
  return result.user
}

/**
 * Página que encerra (por POST) a sessão de quem perdeu o acesso — ver
 * `admin/sessao-encerrada/page.tsx`. Só deve ser alcançada por este redirect:
 * NÃO use em links de navegação.
 */
export const REVOKED_SESSION_PATH = '/admin/sessao-encerrada'

/**
 * Para páginas e layouts do painel. Não lança: redireciona.
 * - sem sessão → login;
 * - usuário inexistente, inativo ou sem papel de equipe → `/admin/sessao-encerrada`,
 *   que encerra a sessão por POST (uma página não pode apagar cookies; mandar direto
 *   ao login criaria um ciclo com o middleware, que devolve usuários logados a `/admin`);
 * - equipe sem a permissão da página → painel inicial com aviso.
 */
export async function requireStaffPage(permission: Permission = 'panel'): Promise<StaffUser> {
  const result = await lookupStaff()
  if (result.kind === 'unauthenticated') redirect('/admin/login')
  if (result.kind === 'forbidden') redirect(REVOKED_SESSION_PATH)
  if (!can(result.user.role, permission)) redirect('/admin?acesso=negado')
  return result.user
}
