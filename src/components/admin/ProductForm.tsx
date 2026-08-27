'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { saveProduct, type ProductFormState } from '@/app/(admin)/admin/(dashboard)/produtos/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import ImageManager, { type ProductImageInput } from '@/components/admin/ImageManager'

interface Option {
  id: string
  name: string
}

export interface ProductFormValues {
  id?: string
  name: string
  slug: string
  description: string
  categoryId: string
  brandId: string
  priceReais: string
  compareAtPriceReais: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  featured: boolean
  iconKey: string
  gradient: string
  specs: { label: string; value: string }[]
  images: ProductImageInput[]
}

interface ProductFormProps {
  categories: Option[]
  brands: Option[]
  initialValues: ProductFormValues
  submitLabel: string
}

const ICON_OPTIONS = ['', 'perfume', 'gift', 'lipstick', 'lotion', 'soap', 'bag', 'sun', 'spray']
const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default function ProductForm({
  categories,
  brands,
  initialValues,
  submitLabel,
}: ProductFormProps) {
  const [state, formAction, isPending] = useActionState<ProductFormState, FormData>(saveProduct, {})

  const [specs, setSpecs] = useState(initialValues.specs)
  const [images, setImages] = useState<ProductImageInput[]>(initialValues.images)

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {initialValues.id && <input type="hidden" name="id" value={initialValues.id} />}
      <input type="hidden" name="specs" value={JSON.stringify(specs.filter((s) => s.label && s.value))} />
      <input type="hidden" name="images" value={JSON.stringify(images)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" defaultValue={initialValues.name} required className="mt-1.5" />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="slug">Slug (URL)</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={initialValues.slug}
            placeholder="gerado a partir do nome se vazio"
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={initialValues.description}
            required
            rows={4}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="categoryId">Categoria</Label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={initialValues.categoryId}
            required
            className={`${inputClass} mt-1.5`}
          >
            <option value="">Selecione...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="brandId">Marca</Label>
          <select
            id="brandId"
            name="brandId"
            defaultValue={initialValues.brandId}
            required
            className={`${inputClass} mt-1.5`}
          >
            <option value="">Selecione...</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="priceReais">Preço (R$)</Label>
          <Input
            id="priceReais"
            name="priceReais"
            defaultValue={initialValues.priceReais}
            inputMode="decimal"
            placeholder="129,90"
            required
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="compareAtPriceReais">Preço &quot;de&quot; (opcional)</Label>
          <Input
            id="compareAtPriceReais"
            name="compareAtPriceReais"
            defaultValue={initialValues.compareAtPriceReais}
            inputMode="decimal"
            placeholder="185,90"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={initialValues.status}
            className={`${inputClass} mt-1.5`}
          >
            <option value="DRAFT">Rascunho</option>
            <option value="ACTIVE">Ativo</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={initialValues.featured}
              className="h-4 w-4 rounded border-neutral-300 text-venus-600"
            />
            Destaque na vitrine
          </label>
        </div>

        <div>
          <Label htmlFor="iconKey">Ícone (fallback sem imagem)</Label>
          <select
            id="iconKey"
            name="iconKey"
            defaultValue={initialValues.iconKey}
            className={`${inputClass} mt-1.5`}
          >
            {ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>
                {icon || '(nenhum)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="gradient">Degradê Tailwind (fallback)</Label>
          <Input
            id="gradient"
            name="gradient"
            defaultValue={initialValues.gradient}
            placeholder="from-fuchsia-400 via-pink-400 to-rose-300"
            className="mt-1.5"
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Especificações</legend>
        {specs.map((spec, index) => (
          <div key={index} className="flex gap-2">
            <Input
              placeholder="Rótulo (ex.: Volume)"
              value={spec.label}
              onChange={(e) =>
                setSpecs((prev) =>
                  prev.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)),
                )
              }
            />
            <Input
              placeholder="Valor (ex.: 75ml)"
              value={spec.value}
              onChange={(e) =>
                setSpecs((prev) =>
                  prev.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSpecs((prev) => prev.filter((_, i) => i !== index))}
              aria-label="Remover especificação"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSpecs((prev) => [...prev, { label: '', value: '' }])}
        >
          <Plus className="size-4" />
          Adicionar especificação
        </Button>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Imagens</legend>
        <ImageManager value={images} onChange={setImages} />
      </fieldset>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/produtos">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}
