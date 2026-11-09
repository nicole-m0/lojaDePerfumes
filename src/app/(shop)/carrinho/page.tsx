import type { Metadata } from 'next'
import CartView from '@/components/CartView'
import { Container, Eyebrow } from '@/components/shop/ui'

// Dinâmica como as demais páginas da loja: o layout lê as categorias no banco, e
// sem isso a página seria pré-renderizada no build (consulta ao banco no build e
// navegação congelada até o próximo deploy).
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sacola' }

export default function CarrinhoPage() {
  return (
    <main className="flex-1 py-12 sm:py-16">
      <Container>
        <Eyebrow>Sua seleção</Eyebrow>
        <h1 className="mb-10 mt-3 text-5xl font-medium text-ink sm:text-6xl">Sacola</h1>
        <CartView />
      </Container>
    </main>
  )
}
