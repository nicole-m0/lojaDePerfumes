import 'server-only'
import type { Role } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export interface StaffUser {
  id: string
  email: string
  role?: Role
}

/**
 * Garante que há um usuário staff autenticado antes de executar uma mutação.
 * Resolve o `id` real do usuário: a sessão JWT atual carrega só `email`/`role`,
 * então quando o `id` não vem na sessão buscamos pelo e-mail (`User.email` é @unique).
 */
export async function requireStaff(): Promise<StaffUser> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    throw new Error('Não autenticado.')
  }

  const sessionId = (session!.user as { id?: string }).id
  if (sessionId) {
    return { id: sessionId, email, role: session!.user.role }
  }

  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isActive: true },
  })
  if (!dbUser || !dbUser.isActive) {
    throw new Error('Usuário não autorizado.')
  }
  return { id: dbUser.id, email, role: dbUser.role }
}
