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
  // Só a equipe do painel tem sessão (a loja não tem login de cliente). 8 horas SEM
  // USO: o cookie é renovado a cada requisição autenticada. Quem for desativado ou
  // perder o papel perde o acesso na hora — páginas e ações conferem o banco
  // (src/server/guard.ts); o prazo só limita tokens esquecidos.
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
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
      if (session.user) {
        // `sub` = id do usuário no banco. O guard consulta o banco por ele; o papel
        // do token é só informativo (nunca usado para autorizar).
        if (token.sub) session.user.id = token.sub
        if (token.role) session.user.role = token.role as Role
      }
      return session
    },
  },
} satisfies NextAuthConfig
