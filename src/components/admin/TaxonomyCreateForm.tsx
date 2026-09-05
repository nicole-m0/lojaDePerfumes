'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import {
  createTaxonomy,
  type TaxonomyState,
} from '@/app/(admin)/admin/(dashboard)/categorias/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function TaxonomyCreateForm({ kind }: { kind: 'category' | 'brand' }) {
  const [state, formAction, isPending] = useActionState<TaxonomyState, FormData>(createTaxonomy, {})
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={formAction} className="flex items-start gap-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex-1">
        <Input name="name" placeholder={kind === 'brand' ? 'Nova marca' : 'Nova categoria'} required />
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus className="size-4" />
        Adicionar
      </Button>
    </form>
  )
}
