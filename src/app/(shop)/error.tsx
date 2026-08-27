'use client'

import { useEffect } from 'react'

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-neutral-800">Não foi possível carregar a loja</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-500">
        Tivemos um problema ao buscar os produtos. Tente novamente em instantes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-venus-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-venus-700"
      >
        Tentar de novo
      </button>
    </main>
  )
}
