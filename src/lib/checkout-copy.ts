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

// ---------------------------------------------------------------------------
// Páginas de retorno /checkout/pendente e /checkout/falha (Etapa D3).
//
// O Mercado Pago manda o cliente para cá com parâmetros próprios (status,
// payment_id…) que o navegador controla: NADA disso é usado. O texto depende só
// de (1) qual página foi aberta e (2) o status de pagamento GRAVADO no banco,
// lido com token válido. Sem token válido: mensagem genérica, sem número do pedido.
// ---------------------------------------------------------------------------

export type ReturnVariant = 'pending' | 'failure'

export interface ReturnCopyInput {
  variant: ReturnVariant
  /** Dados autorizados por token válido; `null` = sem acesso ao resumo. */
  order: { number: number; paymentStatus: string; totalCents: number } | null
}

export interface ReturnCopy {
  status: string
  tone: 'success' | 'pending' | 'error'
  title: string
  body: string
  /** Mostrar número e total do pedido (só com token válido). */
  showOrder: boolean
  cta: { href: string; label: string }
  /** Link secundário "Continuar comprando". */
  showContinue: boolean
}

const FOOTNOTE_CONTACT =
  'Em caso de dúvida, fale com a loja informando o número do pedido.'

export function getReturnCopy({ variant, order }: ReturnCopyInput): ReturnCopy {
  if (!order) {
    return variant === 'pending'
      ? {
          status: 'Pagamento em análise',
          tone: 'pending',
          title: 'Aguardando a confirmação do pagamento',
          body:
            'Se você acabou de pagar, a confirmação chega pelo Mercado Pago e pode levar ' +
            'alguns minutos. Por segurança, os detalhes do pedido só aparecem pelo link ' +
            'gerado no momento da compra.',
          showOrder: false,
          cta: { href: '/', label: 'Voltar à loja' },
          showContinue: false,
        }
      : {
          status: 'Pagamento não concluído',
          tone: 'error',
          title: 'Não foi possível confirmar o pagamento',
          body:
            'Não recebemos a confirmação de um pagamento por aqui. Por segurança, os ' +
            'detalhes do pedido só aparecem pelo link gerado no momento da compra. ' +
            FOOTNOTE_CONTACT,
          showOrder: false,
          cta: { href: '/carrinho', label: 'Voltar à sacola' },
          showContinue: true,
        }
  }

  // O banco é a fonte da verdade — vale mesmo se o cliente caiu na página "errada"
  // (ex.: tentou de novo no Mercado Pago e o pagamento foi aprovado depois).
  if (order.paymentStatus === 'PAID') {
    return {
      status: 'Pagamento confirmado',
      tone: 'success',
      title: 'Pagamento confirmado',
      body:
        'O Mercado Pago já confirmou o pagamento deste pedido. Não é preciso pagar de novo.',
      showOrder: true,
      cta: { href: '/', label: 'Voltar à loja' },
      showContinue: false,
    }
  }

  if (order.paymentStatus !== 'PENDING') {
    // PARTIALLY_PAID, REFUNDED, CHARGEBACK…: não há um texto seguro para cada caso.
    return {
      status: 'Pagamento em revisão',
      tone: 'pending',
      title: 'O pagamento deste pedido está em revisão',
      body: `A loja está conferindo o pagamento deste pedido. ${FOOTNOTE_CONTACT}`,
      showOrder: true,
      cta: { href: '/', label: 'Voltar à loja' },
      showContinue: false,
    }
  }

  return variant === 'pending'
    ? {
        status: 'Pagamento em análise',
        tone: 'pending',
        title: 'Estamos aguardando o pagamento',
        body:
          'Seu pedido está registrado e o Mercado Pago ainda está processando o pagamento ' +
          '(comum em boleto e alguns PIX). Quando ele for aprovado, o pagamento é ' +
          'registrado no pedido — não é preciso pagar de novo.',
        showOrder: true,
        cta: { href: '/', label: 'Voltar à loja' },
        showContinue: false,
      }
    : {
        status: 'Pagamento não concluído',
        tone: 'error',
        title: 'O pagamento não foi finalizado',
        body:
          'Até agora não recebemos a confirmação de pagamento deste pedido. Ele continua ' +
          'registrado, aguardando pagamento. Para tentar de novo, finalize a compra pela ' +
          'sacola — um novo pedido será criado.',
        showOrder: true,
        cta: { href: '/carrinho', label: 'Voltar à sacola' },
        showContinue: true,
      }
}
