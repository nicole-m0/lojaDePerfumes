import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countProducts } from '@/server/catalog'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const productCount = await countProducts().catch(() => null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral do catálogo. Pedidos, estoque e financeiro chegam em breve.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Produtos no catálogo</CardDescription>
            <CardTitle className="text-3xl">{productCount ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {productCount === null
              ? 'Banco indisponível — verifique DATABASE_URL.'
              : 'Gerencie em Produtos.'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pedidos</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Em breve</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Estoque baixo</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Em breve</CardContent>
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
