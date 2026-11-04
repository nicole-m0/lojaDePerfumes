import ResultPanel from './shop/ResultPanel'
import { ButtonLink, TextLink } from './shop/ui'

// Páginas de retorno do Mercado Pago (falha / pendente). São APENAS UX — não
// alteram o estado do pedido. A verdade do pagamento vem do webhook.

interface CheckoutReturnNoticeProps {
  variant: 'failure' | 'pending'
  orderNumber: number | null
}

const CONTENT = {
  failure: {
    status: 'Pagamento não concluído',
    tone: 'error',
    title: 'O pagamento não foi finalizado',
    body: 'O pagamento não foi finalizado no Mercado Pago. Seu pedido continua registrado e aguardando pagamento — você pode tentar de novo pelo carrinho.',
    cta: { href: '/carrinho', label: 'Voltar à sacola' },
  },
  pending: {
    status: 'Pagamento em análise',
    tone: 'pending',
    title: 'Estamos aguardando o pagamento',
    body: 'O Mercado Pago ainda está processando o pagamento (comum em boleto e alguns PIX). Quando o Mercado Pago aprovar, o pagamento é registrado no pedido — não é preciso pagar de novo.',
    cta: { href: '/', label: 'Voltar à loja' },
  },
} as const

export default function CheckoutReturnNotice({ variant, orderNumber }: CheckoutReturnNoticeProps) {
  const c = CONTENT[variant]

  return (
    <ResultPanel
      status={c.status}
      tone={c.tone}
      title={c.title}
      detail={orderNumber != null ? <>Pedido nº {orderNumber}</> : undefined}
      actions={
        <>
          <ButtonLink href={c.cta.href}>{c.cta.label}</ButtonLink>
          {variant === 'failure' && <TextLink href="/">Continuar comprando</TextLink>}
        </>
      }
    >
      <p>{c.body}</p>
    </ResultPanel>
  )
}
