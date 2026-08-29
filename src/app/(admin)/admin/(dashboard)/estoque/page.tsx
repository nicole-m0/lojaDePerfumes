import type { Metadata } from 'next'
import Link from 'next/link'
import { listProductsStock } from '@/server/catalog'
import { isLowStock } from '@/lib/stock'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Estoque' }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

export default async function StockPage() {
  const products = await listProductsStock().catch(() => [])
  const lowCount = products.filter((p) => isLowStock(p.stockOnHand)).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-sm text-muted-foreground">
          Saldo atual por produto (somente leitura). {lowCount > 0 && (
            <span className="font-medium text-destructive">
              {lowCount} produto(s) com estoque zerado ou negativo.
            </span>
          )}
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Estoque atual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nenhum produto cadastrado.
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/admin/produtos/${p.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.category.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      p.status === 'ACTIVE'
                        ? 'default'
                        : p.status === 'DRAFT'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    isLowStock(p.stockOnHand) ? 'font-semibold text-destructive' : ''
                  }`}
                >
                  {p.stockOnHand}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Entradas, saídas, ajustes e baixa automática de estoque serão implementados em uma fase
        posterior.
      </p>
    </div>
  )
}
