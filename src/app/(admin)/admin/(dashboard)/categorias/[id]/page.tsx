import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCategoryWithProducts } from '@/server/catalog'
import { formatCents } from '@/lib/format'
import { isLowStock } from '@/lib/stock'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Produtos da categoria' }

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

export default async function CategoryProductsPage({ params }: PageProps) {
  const { id } = await params
  const category = await getCategoryWithProducts(id)
  if (!category) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/categorias"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Categorias &amp; Marcas
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{category.name}</h1>
        <p className="text-sm text-muted-foreground">
          {category.products.length} produto(s) nesta categoria
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {category.products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum produto nesta categoria.
                </TableCell>
              </TableRow>
            )}
            {category.products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/admin/produtos/${p.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.brand.name}</TableCell>
                <TableCell>{formatCents(p.priceCents)}</TableCell>
                <TableCell
                  className={isLowStock(p.stockOnHand) ? 'font-medium text-destructive' : undefined}
                >
                  {p.stockOnHand}
                </TableCell>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
