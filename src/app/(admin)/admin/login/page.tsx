import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import LoginForm from '@/components/admin/LoginForm'
import Logo from '@/components/brand/Logo'

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ acesso?: string }>
}

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { acesso } = await searchParams
  return (
    <div className="bg-mesh flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo size="md" className="mb-2 justify-center" />
          <CardTitle className="text-xl">Painel administrativo</CardTitle>
          <CardDescription>Acesso restrito à equipe</CardDescription>
        </CardHeader>
        <CardContent>
          {acesso === 'encerrado' && (
            <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              Sua sessão foi encerrada: o acesso ao painel não está mais autorizado para
              esta conta.
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
