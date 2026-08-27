import type { NextAuthConfig } from 'next-auth'
import type { Role } from '@prisma/client'

/**
 * Configuração compartilhada e "edge-safe" do Auth.js.
 * NÃO importa Prisma nem bcrypt — é usada pelo middleware (runtime edge).
 * Os provedores concretos ficam em `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: '/admin/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      if (pathname === '/admin/login') {
        // já logado? manda para o dashboard
        if (isLoggedIn) return Response.redirect(new URL('/admin', nextUrl.origin))
        return true
      }

      if (pathname.startsWith('/admin')) {
        return isLoggedIn
      }

      return true
    },
    jwt({ token, user }) {
      if (user) token.role = user.role
      return token
    },
    session({ session, token }) {
      if (session.user && token.role) {
        session.user.role = token.role as Role
      }
      return session
    },
  },
} satisfies NextAuthConfig
