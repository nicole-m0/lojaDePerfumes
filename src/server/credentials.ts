import 'server-only'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isStaffRole } from '@/lib/roles'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export interface StaffSessionUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: Role
}

/**
 * Login do painel (provider Credentials do Auth.js). Só devolve o usuário quando:
 * e-mail e senha válidos, conta ativa e papel de equipe (OWNER/ADMIN/STAFF).
 * Qualquer outro caso → `null` (mesma resposta genérica para não revelar o motivo).
 */
export async function verifyStaffCredentials(raw: unknown): Promise<StaffSessionUser | null> {
  const parsed = credentialsSchema.safeParse(raw)
  if (!parsed.success) return null

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash || !user.isActive) return null
  // Só a equipe entra no painel; CUSTOMER nem recebe sessão.
  if (!isStaffRole(user.role)) return null

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return null

  return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role }
}
