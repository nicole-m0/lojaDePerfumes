import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  isWhatsAppCloudApiConfigured,
  sendTemplateMessage,
  WhatsAppCloudApiError,
} from './cloud-api'

const ORIG = { ...process.env }
const TOKEN = 'super-secret-access-token'

afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function configure() {
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890'
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
}

const input = {
  to: '+5511999999999',
  templateName: 'pedido_confirmado',
  languageCode: 'pt_BR',
  bodyParams: ['42', 'R$ 129,90'],
}

describe('isWhatsAppCloudApiConfigured', () => {
  it('só true quando phone number id E access token estão definidos', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    delete process.env.WHATSAPP_ACCESS_TOKEN
    expect(isWhatsAppCloudApiConfigured()).toBe(false)

    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    expect(isWhatsAppCloudApiConfigured()).toBe(false)

    process.env.WHATSAPP_ACCESS_TOKEN = 'tok'
    expect(isWhatsAppCloudApiConfigured()).toBe(true)
  })
})

describe('sendTemplateMessage', () => {
  it('sucesso: envia POST autenticado e retorna o providerMessageId (wamid)', async () => {
    configure()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.HBgLMTIz==' }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTemplateMessage(input)

    expect(result.providerMessageId).toBe('wamid.HBgLMTIz==')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)

    const body = JSON.parse(init.body)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.to).toBe('5511999999999') // sem "+", como a Graph API exige
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('pedido_confirmado')
    expect(body.template.language.code).toBe('pt_BR')
    expect(body.template.components[0]).toEqual({
      type: 'body',
      parameters: [
        { type: 'text', text: '42' },
        { type: 'text', text: 'R$ 129,90' },
      ],
    })
  })

  it('omite "components" quando não há bodyParams', async () => {
    configure()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendTemplateMessage({ ...input, bodyParams: undefined })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template.components).toBeUndefined()
  })

  it('versão da Graph API é centralizada e configurável via env', async () => {
    configure()
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v99.0'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendTemplateMessage(input)

    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.facebook.com/v99.0/1234567890/messages')
  })

  it('erro retornado pela API da Meta (HTTP 4xx com corpo de erro) vira WhatsAppCloudApiError', async () => {
    configure()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid parameter', code: 100 } }), {
          status: 400,
        }),
      ),
    )

    const err = await sendTemplateMessage(input).catch((e) => e)
    expect(err).toBeInstanceOf(WhatsAppCloudApiError)
    expect(err.message).toContain('Invalid parameter')
    expect(err.status).toBe(400)
    expect(err.metaErrorCode).toBe(100)
  })

  it('erro HTTP sem corpo JSON de erro vira mensagem genérica com o status', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway timeout', { status: 504 })))

    const err = await sendTemplateMessage(input).catch((e) => e)
    expect(err).toBeInstanceOf(WhatsAppCloudApiError)
    expect(err.message).toContain('504')
    // Nunca repassa o corpo bruto da resposta como texto.
    expect(err.message).not.toContain('gateway timeout')
  })

  it('falha de rede (fetch rejeita) vira WhatsAppCloudApiError previsível', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

    const err = await sendTemplateMessage(input).catch((e) => e)
    expect(err).toBeInstanceOf(WhatsAppCloudApiError)
    expect(err.message).not.toContain('ECONNRESET')
  })

  it('resposta 200 malformada (sem messages[0].id) vira WhatsAppCloudApiError', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })))

    await expect(sendTemplateMessage(input)).rejects.toThrow(WhatsAppCloudApiError)
  })

  it('resposta 200 com corpo não-JSON vira WhatsAppCloudApiError (não lança parse error cru)', async () => {
    configure()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('não é json', { status: 200 })))

    await expect(sendTemplateMessage(input)).rejects.toThrow(WhatsAppCloudApiError)
  })

  it('sem WHATSAPP_PHONE_NUMBER_ID, lança antes de chamar a rede', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendTemplateMessage(input)).rejects.toThrow('WHATSAPP_PHONE_NUMBER_ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem WHATSAPP_ACCESS_TOKEN, lança antes de chamar a rede', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    delete process.env.WHATSAPP_ACCESS_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendTemplateMessage(input)).rejects.toThrow('WHATSAPP_ACCESS_TOKEN')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('telefone de destino sem dígitos é rejeitado antes de chamar a rede', async () => {
    configure()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendTemplateMessage({ ...input, to: '+' })).rejects.toThrow(WhatsAppCloudApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('o access token nunca aparece em mensagens de erro nem é logado', async () => {
    configure()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Dispara os três caminhos de erro possíveis: falha de rede, erro HTTP/Meta
    // e resposta malformada — em nenhum deles o token pode vazar.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const networkErr = await sendTemplateMessage(input).catch((e) => e)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 401 })),
    )
    const apiErr = await sendTemplateMessage(input).catch((e) => e)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    const malformedErr = await sendTemplateMessage(input).catch((e) => e)

    for (const err of [networkErr, apiErr, malformedErr]) {
      expect(String(err.message)).not.toContain(TOKEN)
      expect(String(err.stack)).not.toContain(TOKEN)
    }

    const allLoggedText = [...consoleErrorSpy.mock.calls, ...consoleLogSpy.mock.calls]
      .flat()
      .map((v) => JSON.stringify(v))
      .join('\n')
    expect(allLoggedText).not.toContain(TOKEN)
  })
})
