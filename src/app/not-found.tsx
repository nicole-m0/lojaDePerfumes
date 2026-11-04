import Link from 'next/link'
import Logo from '@/components/brand/Logo'
import ResultPanel from '@/components/shop/ResultPanel'
import { ButtonLink, TextLink } from '@/components/shop/ui'

// 404 global: fica fora do layout da loja (sem cabeçalho), então traz a marca.
export default function NotFound() {
  return (
    <div data-surface="shop" className="flex min-h-svh flex-1 flex-col">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center px-5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Página inicial">
            <Logo size="sm" />
          </Link>
        </div>
      </header>
      <ResultPanel
        status="Erro 404"
        title={
          <>
            Esta página <em>se perdeu</em> no caminho.
          </>
        }
        actions={
          <>
            <ButtonLink href="/">Voltar à loja</ButtonLink>
            <TextLink href="/#colecoes">Ver coleções</TextLink>
          </>
        }
      >
        <p>O produto ou a página que você procura não existe ou foi removido.</p>
      </ResultPanel>
    </div>
  )
}
