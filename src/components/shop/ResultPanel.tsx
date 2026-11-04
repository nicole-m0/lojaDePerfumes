import type { ReactNode } from 'react'
import { Container } from './ui'

// Composição tipográfica comum às páginas de resultado (sucesso, pendente,
// falha, 404, erro): sobretítulo de status, título grande, detalhe opcional
// (ex.: número do pedido), texto e ações. Sem ícones decorativos.

const TONES = {
  neutral: 'text-ink-soft',
  success: 'text-emerald-800',
  pending: 'text-champagne-700',
  error: 'text-red-800',
} as const

export default function ResultPanel({
  status,
  tone = 'neutral',
  title,
  detail,
  children,
  actions,
}: {
  status: string
  tone?: keyof typeof TONES
  title: ReactNode
  /** Linha de destaque abaixo do título (ex.: "Pedido nº 12 · R$ 99,90"). */
  detail?: ReactNode
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <main className="flex flex-1 items-center py-20 sm:py-28">
      <Container>
        <div className="max-w-2xl border-l border-hairline pl-6 sm:pl-10">
          <p className={`eyebrow flex items-center gap-3 ${TONES[tone]}`}>
            <span aria-hidden="true" className="h-px w-8 bg-current" />
            {status}
          </p>
          <h1 className="mt-6 text-5xl font-medium leading-[1.02] text-ink sm:text-7xl">{title}</h1>
          {detail && (
            <p className="mt-6 font-display text-2xl text-champagne-700 lining-nums">{detail}</p>
          )}
          {children && (
            <div className="mt-6 max-w-lg space-y-3 text-[0.95rem] leading-relaxed text-ink/85">
              {children}
            </div>
          )}
          {actions && (
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">{actions}</div>
          )}
        </div>
      </Container>
    </main>
  )
}
