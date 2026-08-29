import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardCounts } from '@/server/catalog'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const counts = await getDashboardCounts().catch(() => null)
  const n = (v: number | undefined) => (counts ? v : '—')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {counts === null
            ? 'Banco indisponível — verifique DATABASE_URL.'
            : 'Visão geral do catálogo e dos pedidos.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Produtos ativos</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.activeProducts)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/produtos" className="hover:text-foreground">
              Gerenciar produtos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Categorias</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.categories)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/categorias" className="hover:text-foreground">
              Categorias &amp; Marcas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Marcas</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.brands)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/categorias" className="hover:text-foreground">
              Categorias &amp; Marcas
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pedidos</CardDescription>
            <CardTitle className="text-3xl">{n(counts?.orders)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/admin/pedidos" className="hover:text-foreground">
              Ver pedidos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Faturamento (mês)</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Em breve</CardContent>
        </Card>
      </div>
    </div>
  )
}
