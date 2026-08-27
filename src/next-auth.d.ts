import type { Role } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    role?: Role
  }

  interface Session {
    user: {
      role?: Role
    } & DefaultSession['user']
  }
}

// O `JWT` é declarado em `@auth/core/jwt`; `next-auth/jwt` apenas re-exporta.
declare module '@auth/core/jwt' {
  interface JWT {
    role?: Role
  }
}
