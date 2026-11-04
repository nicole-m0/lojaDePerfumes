'use client'

import { useEffect } from 'react'
import ResultPanel from '@/components/shop/ResultPanel'
import { buttonClasses } from '@/components/shop/ui'

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
    <ResultPanel
      status="Algo deu errado"
      tone="error"
      title="Não foi possível carregar a loja"
      actions={
        <button type="button" onClick={reset} className={buttonClasses('primary')}>
          Tentar de novo
        </button>
      }
    >
      <p>Tivemos um problema ao buscar os produtos. Tente novamente em instantes.</p>
    </ResultPanel>
  )
}
