import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? 'Administrador'

  if (!email || !password) {
    console.warn(
      '[seed] ADMIN_EMAIL / ADMIN_PASSWORD não definidos — pulando criação do usuário admin.',
    )
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: Role.OWNER, isActive: true },
    create: { email, name, passwordHash, role: Role.OWNER },
  })

  console.log(`[seed] usuário admin garantido: ${user.email} (${user.role})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
