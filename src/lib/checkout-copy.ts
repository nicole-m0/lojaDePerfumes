// Textos das páginas de retorno do checkout — funções puras e testáveis.
//
// Regra: nunca prometer o que ainda não aconteceu. A página de retorno NÃO
// confirma pagamento, NÃO confirma o pedido e NÃO baixa estoque. Só dizemos
// "pagamento confirmado" quando o status gravado no banco (atualizado pelo
// webhook/reconsulta do Mercado Pago ou pelo admin) já é PAID.

export interface ConfirmationCopyInput {
  /** Dados do pedido autorizados por token válido; `null` = sem acesso ao resumo. */
  order: { number: number; paymentStatus: string; totalCents: number } | null
  /** Mercado Pago configurado neste ambiente (pagamento online). */
  onlinePayment: boolean
}

export interface ConfirmationCopy {
  tone: 'paid' | 'pending'
  title: string
  body: string
  footnote: string
}

export function getConfirmationCopy({
  order,
  onlinePayment,
}: ConfirmationCopyInput): ConfirmationCopy {
  const footnote =
    'Guarde o número do pedido. Em caso de dúvida, fale com a loja informando esse número.'

  if (!order) {
    return {
      tone: 'pending',
      title: 'Pedido recebido',
      body:
        'Se você acabou de finalizar uma compra, seu pedido foi registrado. ' +
        'Por segurança, os detalhes só aparecem pelo link gerado no momento da compra.',
      footnote,
    }
  }

  if (order.paymentStatus === 'PAID') {
    return {
      tone: 'paid',
      title: 'Pagamento confirmado',
      body:
        'Recebemos a confirmação do pagamento. Agora a loja vai conferir o pedido e ' +
        'preparar o envio.',
      footnote,
    }
  }

  return {
    tone: 'pending',
    title: 'Pedido recebido',
    body: onlinePayment
      ? 'Seu pedido foi registrado e está aguardando a confirmação do pagamento pelo ' +
        'Mercado Pago. Essa confirmação pode levar alguns minutos (ou mais, no boleto).'
      : 'Seu pedido foi registrado e está aguardando pagamento. A loja vai entrar em ' +
        'contato pelo telefone ou e-mail informado para combinar a forma de pagamento.',
    footnote,
  }
}
