import 'server-only'
import type { Role } from '@prisma/client'
import { auth } from '@/auth'

/** Garante que há um usuário staff autenticado antes de executar uma mutação. */
export async function requireStaff(): Promise<{ id: string; email: string; role?: Role }> {
  const session = await auth()
  const user = session?.user
  if (!user?.email) {
    throw new Error('Não autenticado.')
  }
  return { id: (user as { id?: string }).id ?? '', email: user.email, role: user.role }
}
