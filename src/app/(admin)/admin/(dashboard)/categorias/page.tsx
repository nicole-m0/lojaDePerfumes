import type { Metadata } from 'next'
import { listBrandsAdmin, listCategoriesAdmin } from '@/server/catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import TaxonomyCreateForm from '@/components/admin/TaxonomyCreateForm'
import { deleteTaxonomy, renameTaxonomy } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Categorias & Marcas' }

type Row = { id: string; name: string; _count: { products: number } }

function TaxonomyList({ kind, rows }: { kind: 'category' | 'brand'; rows: Row[] }) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <form action={renameTaxonomy} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={row.id} />
            <Input name="name" defaultValue={row.name} className="h-8" />
            <Button type="submit" variant="ghost" size="sm">
              Salvar
            </Button>
          </form>

          <Badge variant="secondary">{row._count.products} prod.</Badge>

          <form action={deleteTaxonomy}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={row.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={row._count.products > 0}
              title={row._count.products > 0 ? 'Em uso por produtos' : 'Excluir'}
            >
              Excluir
            </Button>
          </form>
        </div>
      ))}
    </div>
  )
}

export default async function TaxonomyPage() {
  const [categories, brands] = await Promise.all([
    listCategoriesAdmin().catch(() => []),
    listBrandsAdmin().catch(() => []),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Categorias &amp; Marcas</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Categorias</h2>
        <TaxonomyCreateForm kind="category" />
        <TaxonomyList kind="category" rows={categories} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Marcas</h2>
        <TaxonomyCreateForm kind="brand" />
        <TaxonomyList kind="brand" rows={brands} />
      </section>
    </div>
  )
}
