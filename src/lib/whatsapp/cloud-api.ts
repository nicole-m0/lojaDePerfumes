import 'server-only'

// ---------------------------------------------------------------------------
// Cliente WhatsApp Cloud API — envio de mensagens de template (Fase 7).
//
// Sem SDK: chamadas REST diretas com `fetch` (mesmo padrão de src/lib/mercadopago.ts
// e src/lib/shipping/melhorenvio.ts). Token e phone number id vêm SEMPRE de
// variáveis de ambiente, nunca do código.
//
// Cliente isolado: não conhece Order/Customer, não decide QUANDO notificar —
// só sabe conversar com a Graph API. A orquestração (quando enviar, o que
// logar, o histórico em WhatsAppMessage) é responsabilidade de uma camada de
// serviço futura, como src/server/shipping.ts é para src/lib/shipping/melhorenvio.ts.
//
// Segurança: o token de acesso nunca é interpolado em mensagem de erro nem
// logado — só usado no header `Authorization` da requisição em si.
// ---------------------------------------------------------------------------

const DEFAULT_GRAPH_API_VERSION = 'v21.0'

/** Versão da Graph API — única fonte de verdade (evita espalhar pelo código). */
function graphApiVersion(): string {
  return process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION
}

function graphApiBaseUrl(): string {
  return `https://graph.facebook.com/${graphApiVersion()}`
}

export function isWhatsAppCloudApiConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID) && Boolean(process.env.WHATSAPP_ACCESS_TOKEN)
}

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new WhatsAppCloudApiError('WHATSAPP_PHONE_NUMBER_ID não configurado.')
  return id
}

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new WhatsAppCloudApiError('WHATSAPP_ACCESS_TOKEN não configurado.')
  return token
}

// --- Erro tipado -------------------------------------------------------
// Nunca inclui o token de acesso; carrega só o que a própria Meta devolveu
// no corpo do erro (mensagem/código), nunca o corpo bruto da resposta.

export class WhatsAppCloudApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly metaErrorCode?: number,
  ) {
    super(message)
    this.name = 'WhatsAppCloudApiError'
  }
}

// --- Envio de mensagem de template --------------------------------------

export interface SendTemplateMessageInput {
  /** Destinatário em E.164 (ex.: "+5511999999999" — ver src/lib/whatsapp/phone.ts). */
  to: string
  /** Nome do template já aprovado no Meta Business Manager. */
  templateName: string
  /** Código de idioma cadastrado para o template na Meta (ex.: "pt_BR"). */
  languageCode: string
  /** Parâmetros posicionais do corpo do template ({{1}}, {{2}}...), em ordem. */
  bodyParams?: string[]
}

export interface SendTemplateMessageResult {
  /** Id da mensagem no WhatsApp Cloud API ("wamid..."), para idempotência/histórico. */
  providerMessageId: string
}

interface GraphApiSendResponse {
  messages?: { id?: string }[]
}

interface GraphApiErrorResponse {
  error?: { message?: string; code?: number }
}

/** Só dígitos — a Graph API espera o destinatário sem "+" no campo `to`. */
function toGraphApiPhone(e164: string): string {
  return e164.replace(/\D/g, '')
}

function buildTemplateBody(input: SendTemplateMessageInput): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to: toGraphApiPhone(input.to),
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(input.bodyParams?.length
        ? {
            components: [
              {
                type: 'body',
                parameters: input.bodyParams.map((text) => ({ type: 'text', text })),
              },
            ],
          }
        : {}),
    },
  }
}

/**
 * Envia uma mensagem de template pelo WhatsApp Cloud API. Lança
 * `WhatsAppCloudApiError` (nunca a exceção crua do `fetch`/`Response`) quando:
 * faltar configuração, a chamada de rede falhar, a Meta responder erro, ou a
 * resposta de sucesso vier sem o id da mensagem.
 */
export async function sendTemplateMessage(
  input: SendTemplateMessageInput,
): Promise<SendTemplateMessageResult> {
  const to = toGraphApiPhone(input.to)
  if (!to) {
    throw new WhatsAppCloudApiError('Telefone de destino inválido.')
  }

  const url = `${graphApiBaseUrl()}/${phoneNumberId()}/messages`
  const token = accessToken()

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildTemplateBody(input)),
      cache: 'no-store',
    })
  } catch {
    // Nunca repassa o erro cru do fetch: pode carregar detalhes de rede/DNS
    // irrelevantes para quem chama, e nunca deve incluir o header Authorization.
    throw new WhatsAppCloudApiError('Não foi possível conectar ao WhatsApp Cloud API.')
  }

  const json: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const metaError = (json as GraphApiErrorResponse | null)?.error
    throw new WhatsAppCloudApiError(
      metaError?.message
        ? `WhatsApp Cloud API: ${metaError.message}`
        : `WhatsApp Cloud API: falha ao enviar mensagem (HTTP ${res.status}).`,
      res.status,
      metaError?.code,
    )
  }

  const messageId = (json as GraphApiSendResponse | null)?.messages?.[0]?.id
  if (!messageId) {
    throw new WhatsAppCloudApiError('WhatsApp Cloud API: resposta inesperada ao enviar mensagem.')
  }

  return { providerMessageId: messageId }
}
