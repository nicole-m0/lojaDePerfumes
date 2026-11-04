import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import LoginForm from '@/components/admin/LoginForm'
import Logo from '@/components/brand/Logo'

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
}

export default function AdminLoginPage() {
  return (
    <div className="bg-mesh flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo size="md" className="mb-2 justify-center" />
          <CardTitle className="text-xl">Painel administrativo</CardTitle>
          <CardDescription>Acesso restrito à equipe</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
