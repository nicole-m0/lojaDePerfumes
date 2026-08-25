import { Link } from 'react-router-dom'
import { SprayCan } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-venus-50">
        <SprayCan className="h-9 w-9 text-venus-300" strokeWidth={1.5} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-neutral-800">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        O produto ou a página que você procura não existe ou foi removida.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
      >
        Voltar para a loja
      </Link>
    </main>
  )
}
