import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { products } from '@/data/products'

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Fundação pronta (Fase 0). Catálogo, pedidos, estoque e financeiro chegam nas próximas
          fases.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Produtos no catálogo</CardDescription>
            <CardTitle className="text-3xl">{products.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Ainda em arquivo estático — migra para o banco na Fase 1.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pedidos</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Fase 2</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Estoque baixo</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Fase 3</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Faturamento (mês)</CardDescription>
            <CardTitle className="text-3xl">—</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Fase 6</CardContent>
        </Card>
      </div>
    </div>
  )
}
