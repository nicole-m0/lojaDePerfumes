import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Logo from '@/components/brand/Logo'
import RevokedSessionForm from '@/components/admin/RevokedSessionForm'
import { lookupStaff } from '@/server/guard'

// Destino de requireStaffPage quando o usuário da sessão perdeu o acesso (inexistente,
// inativo ou sem papel de equipe).
//
// - Fica FORA do layout do painel (que tem guarda própria): não há ciclo de redirect.
// - GET aqui NÃO encerra nada. Usuário ainda autorizado é mandado ao painel; sem
//   sessão, o middleware já manda ao login. Só quem perdeu o acesso vê o formulário,
//   que encerra a sessão por POST (Server Action com conferência de origem).
//
// NÃO use esta rota em links de navegação (<Link>/<a>): ela só deve ser alcançada
// pelo redirect do guard. Um <Link> faria pré-carga dela sem necessidade.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Sessão encerrada',
  robots: { index: false, follow: false },
}

export default async function RevokedSessionPage() {
  const result = await lookupStaff()
  if (result.kind === 'ok') redirect('/admin')
  if (result.kind === 'unauthenticated') redirect('/admin/login')

  return (
    <div className="bg-mesh flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo size="md" className="mb-2 justify-center" />
          <CardTitle className="text-xl">Acesso encerrado</CardTitle>
          <CardDescription>
            Esta conta não tem mais acesso ao painel. Encerrando a sessão…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RevokedSessionForm />
        </CardContent>
      </Card>
    </div>
  )
}
