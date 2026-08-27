import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

export default NextAuth(authConfig).auth

export const config = {
  // Protege o painel; ignora assets e rotas internas do Next.
  matcher: ['/admin/:path*'],
}
