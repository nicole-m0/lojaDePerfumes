import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { listAdminProducts } from '@/server/catalog'
import { formatCents } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Produtos' }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

export default async function AdminProductsPage() {
  const products = await listAdminProducts().catch(() => [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">{products.length} no catálogo</p>
        </div>
        <Button asChild>
          <Link href="/admin/produtos/novo">
            <Plus className="size-4" />
            Novo produto
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum produto ainda. Rode <code>npm run db:seed</code> ou crie um novo.
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/admin/produtos/${p.id}`}
                    className="flex items-center gap-3 font-medium hover:text-primary"
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {p.images[0]?.url && (
                        <Image
                          src={p.images[0].url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 max-w-xs whitespace-normal">{p.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.category.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.brand.name}</TableCell>
                <TableCell>{formatCents(p.priceCents)}</TableCell>
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
