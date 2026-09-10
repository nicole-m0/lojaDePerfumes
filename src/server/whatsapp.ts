import 'server-only'
import { prisma } from '@/lib/prisma'
import { normalizePhoneToE164 } from '@/lib/whatsapp/phone'
import {
  isWhatsAppCloudApiConfigured,
  sendTemplateMessage,
  WhatsAppCloudApiError,
} from '@/lib/whatsapp/cloud-api'

// ---------------------------------------------------------------------------
// Orquestração WhatsApp — cola entre o cliente Cloud API (src/lib/whatsapp/) e
// o histórico em WhatsAppMessage. Mesmo papel que src/server/mercadopago.ts
// tem para src/lib/mercadopago.ts: valida/normaliza, chama o provedor injetável
// e persiste o resultado — nunca decide POR CONTA PRÓPRIA quando notificar.
//
// Quem chama este serviço (actions de Order/Shipment, numa etapa futura) decide
// o QUANDO; este arquivo só decide COMO registrar e enviar UMA notificação.
//
// Best-effort por design: NUNCA lança. Falha de configuração, telefone
// inválido, erro de rede ou erro da Meta terminam em um resultado tipado —
// nunca interrompem quem chamou (ex.: uma transição de status de pedido não
// pode falhar porque o WhatsApp está fora do ar).
// ---------------------------------------------------------------------------

export interface SendOrderWhatsAppNotificationInput {
  orderId: string
  /** Telefone bruto (qualquer formato aceito por normalizePhoneToE164). */
  phone: string | null | undefined
  /** Nome do template já aprovado na Meta. */
  templateName: string
  /** Código de idioma cadastrado para o template (ex.: "pt_BR"). */
  languageCode: string
  /** Parâmetros posicionais do corpo do template, em ordem. */
  bodyParams?: string[]
}

export type SendOrderWhatsAppNotificationOutcome =
  | 'sent'
  | 'skipped_duplicate'
  | 'invalid_phone'
  | 'not_configured'
  | 'failed'

export interface SendOrderWhatsAppNotificationResult {
  outcome: SendOrderWhatsAppNotificationOutcome
  /** id interno do WhatsAppMessage, quando um registro foi criado. */
  messageId?: string
  /** wamid, quando o envio foi aceito pela Meta (ou já tinha sido, em skipped_duplicate). */
  providerMessageId?: string
  /** Mensagem segura (sem token) do motivo da falha, quando outcome = 'failed'. */
  error?: string
}

export interface WhatsAppServiceDeps {
  send: typeof sendTemplateMessage
}

const defaultDeps: WhatsAppServiceDeps = { send: sendTemplateMessage }

/** Estados que contam como "já notificado" para fins de deduplicação (ver nota abaixo). */
const ALREADY_SENT_STATUSES = ['SENT', 'DELIVERED', 'READ'] as const

/**
 * Envia UMA notificação de WhatsApp para o pedido e registra o resultado em
 * WhatsAppMessage. Fluxo: cria o registro PENDING → chama a Cloud API → move
 * para SENT (com providerMessageId/sentAt) ou FAILED (com errorMessage/failedAt).
 *
 * --- Idempotência: o que há e o que NÃO há -------------------------------
 * `WhatsAppMessage.providerMessageId` é `@unique` no schema (Etapa 1) — isso
 * impede duas linhas com o mesmo wamid, útil para o webhook de status (etapa
 * futura) processar callbacks repetidos com segurança.
 *
 * Só isso, porém, não evita ENVIAR duas vezes o mesmo template para o mesmo
 * pedido: o wamid só existe DEPOIS que a Meta aceita o envio, então não pode
 * ser a chave que previne o envio duplicado em si. O schema atual não tem
 * (nem esta etapa cria) uma constraint única em (orderId, templateName) — uma
 * garantia forte exigiria migration, fora do escopo aqui.
 *
 * Por isso a deduplicação atual é em nível de aplicação, best-effort: antes de
 * criar um novo registro, procura um WhatsAppMessage do mesmo pedido+template
 * já SENT/DELIVERED/READ e, se achar, pula o envio (`skipped_duplicate`) sem
 * tentar de novo. Uma tentativa anterior FAILED não bloqueia retry — é
 * exatamente o caso que deve poder ser reenviado.
 *
 * LIMITAÇÃO CONHECIDA: sem lock/transação cobrindo a checagem, duas chamadas
 * verdadeiramente concorrentes para o mesmo pedido+template podem ambas
 * passar pela checagem antes de qualquer uma commitar e gerar duas mensagens
 * enviadas. Isso é aceitável nesta etapa porque quem decide QUANDO chamar este
 * serviço (a integração com as actions, etapa futura) roda dentro do fluxo já
 * serializado de uma única transição de status por vez — se essa suposição
 * mudar, uma constraint única (orderId, templateName) via migration nova
 * resolveria de vez, mas não é criada aqui por não fazer parte do escopo.
 */
export async function sendOrderWhatsAppNotification(
  input: SendOrderWhatsAppNotificationInput,
  deps: WhatsAppServiceDeps = defaultDeps,
): Promise<SendOrderWhatsAppNotificationResult> {
  try {
    if (!isWhatsAppCloudApiConfigured()) {
      return { outcome: 'not_configured' }
    }

    const phone = normalizePhoneToE164(input.phone)
    if (!phone) {
      return { outcome: 'invalid_phone' }
    }

    const existing = await prisma.whatsAppMessage.findFirst({
      where: {
        orderId: input.orderId,
        templateName: input.templateName,
        status: { in: [...ALREADY_SENT_STATUSES] },
      },
      select: { id: true, providerMessageId: true },
    })
    if (existing) {
      return {
        outcome: 'skipped_duplicate',
        messageId: existing.id,
        providerMessageId: existing.providerMessageId ?? undefined,
      }
    }

    const record = await prisma.whatsAppMessage.create({
      data: {
        orderId: input.orderId,
        phone,
        templateName: input.templateName,
        status: 'PENDING',
      },
    })

    try {
      const sent = await deps.send({
        to: phone,
        templateName: input.templateName,
        languageCode: input.languageCode,
        bodyParams: input.bodyParams,
      })

      await prisma.whatsAppMessage.update({
        where: { id: record.id },
        data: { status: 'SENT', providerMessageId: sent.providerMessageId, sentAt: new Date() },
      })

      return { outcome: 'sent', messageId: record.id, providerMessageId: sent.providerMessageId }
    } catch (err) {
      // Só confia na mensagem quando é o erro tipado do cliente (Etapa 3 garante que
      // NUNCA carrega o access token). Qualquer outro tipo de erro vira mensagem
      // genérica — nunca `String(err)`/`err.message` cru, que poderia vazar detalhe
      // inesperado (ex.: um erro de infraestrutura que ecoe variáveis de ambiente).
      const safeMessage =
        err instanceof WhatsAppCloudApiError ? err.message : 'Erro inesperado ao enviar mensagem.'

      await prisma.whatsAppMessage
        .update({
          where: { id: record.id },
          data: { status: 'FAILED', failedAt: new Date(), errorMessage: safeMessage },
        })
        .catch(() => {
          // Best-effort também aqui: se nem o UPDATE de falha for possível (ex.: banco
          // momentaneamente fora do ar), ainda assim não propaga — ver doc da função.
        })

      return { outcome: 'failed', messageId: record.id, error: safeMessage }
    }
  } catch {
    // Qualquer falha inesperada antes mesmo de criar o registro (ex.: banco fora do
    // ar) também nunca propaga — este serviço é sempre best-effort para quem chama.
    return { outcome: 'failed' }
  }
}
