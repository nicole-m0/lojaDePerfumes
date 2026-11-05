import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { listAdminProducts } from '@/server/catalog'
import { formatCents } from '@/lib/format'
import { isLowStock } from '@/lib/stock'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireStaffPage } from '@/server/guard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Produtos' }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

const REMOVAL_NOTICE: Record<string, { text: string; error?: boolean }> = {
  excluido: { text: 'Produto excluído.' },
  arquivado: {
    text:
      'O produto tem pedidos ou movimentações de estoque, por isso foi arquivado (não aparece ' +
      'mais na loja, mas o histórico foi preservado). Para reativar, edite e mude o status.',
  },
  'nao-encontrado': { text: 'Produto não encontrado — talvez já tenha sido removido.', error: true },
  erro: { text: 'Não foi possível remover o produto. Tente novamente.', error: true },
}

interface PageProps {
  searchParams: Promise<{ removido?: string }>
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  await requireStaffPage()
  const { removido } = await searchParams
  const notice = removido ? REMOVAL_NOTICE[removido] : undefined
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

      {notice && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.error
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-border bg-muted/40 text-foreground'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
