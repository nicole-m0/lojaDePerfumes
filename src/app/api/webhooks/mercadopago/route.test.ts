import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFakePrisma, type FakePrisma, type Row } from '@/test/fake-prisma'
import type { MercadoPagoPayment } from '@/lib/mercadopago'

// ---------------------------------------------------------------------------
// Webhook do Mercado Pago de ponta a ponta (Etapa D3): rota real → assinatura HMAC
// real → orquestração → pagamentos → confirmação automática da D2 → estoque. Sem
// banco (Prisma falso) e sem rede: a consulta à API do Mercado Pago e o envio de
// WhatsApp são substituídos. Nenhuma credencial real é usada.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({
  fake: null as unknown as FakePrisma,
  apiPayment: null as MercadoPagoPayment | null,
  fetchPayment: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  sendWhatsApp: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop === 'symbol') return undefined
        return (h.fake as unknown as Row)[prop]
      },
    },
  ),
}))
vi.mock('@/lib/mercadopago', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mercadopago')>()),
  getMercadoPagoPayment: (id: string) => h.fetchPayment(id),
}))
vi.mock('@/server/whatsapp', () => ({
  sendOrderWhatsAppNotification: (input: unknown) => h.sendWhatsApp(input),
}))

import { POST } from './route'

const SECRET = 'segredo-de-teste-do-webhook'
const ORDER_ID = 'ord_1'
const PAY_ID = '123456789012'
const ORIG = { ...process.env }

function apiPayment(over: Partial<MercadoPagoPayment> = {}): MercadoPagoPayment {
  return {
    id: PAY_ID,
    status: 'approved',
    externalReference: ORDER_ID,
    transactionAmount: 100,
    currencyId: 'BRL',
    paymentTypeId: 'credit_card',
    paymentMethodId: 'visa',
    liveMode: false,
    ...over,
  }
}

function sign(dataId: string, requestId = 'req-1', ts = '1730000000000', secret = SECRET) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`
}

interface NotifyOptions {
  query?: string
  body?: unknown
  rawBody?: string
  signature?: string | null
  requestId?: string | null
}

/** Notificação no formato do Mercado Pago, assinada corretamente por padrão. */
function notification(opts: NotifyOptions = {}) {
  const query = opts.query ?? `data.id=${PAY_ID}&type=payment`
  const idForSignature = new URLSearchParams(query).get('data.id') ?? PAY_ID
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const requestId = opts.requestId === undefined ? 'req-1' : opts.requestId
  const signature = opts.signature === undefined ? sign(idForSignature) : opts.signature
  if (requestId !== null) headers['x-request-id'] = requestId
  if (signature !== null) headers['x-signature'] = signature
  return new Request(`http://localhost/api/webhooks/mercadopago?${query}`, {
    method: 'POST',
    headers,
    body:
      opts.rawBody ??
      JSON.stringify(opts.body ?? { action: 'payment.updated', type: 'payment', data: { id: PAY_ID } }),
  })
}

async function send(opts: NotifyOptions = {}) {
  const res = await POST(notification(opts))
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

const st = () => h.fake._state
const order = () => st().orders.find((o) => o.id === ORDER_ID)!
const stock = (id: string) => st().products.find((p) => p.id === id)!.stockOnHand
const sales = () => st().stockMovements.filter((m) => m.type === 'OUTBOUND' && m.reason === 'SALE')

function expectNothingHappened() {
  expect(h.fetchPayment).not.toHaveBeenCalled()
  expect(st().payments).toHaveLength(0)
  expect(st().orderEvents).toHaveLength(0)
  expect(order().status).toBe('PENDING')
  expect(stock('p_rosa')).toBe(5)
}

beforeEach(() => {
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET
  h.fake = makeFakePrisma()
  h.fake.seedOrder({ id: ORDER_ID, number: 7, customerPhone: '+5511999990000', totalCents: 10000, currency: 'BRL' })
  h.fake.seedItem({ orderId: ORDER_ID, productId: 'p_rosa', productName: 'Rosalume', quantity: 2 })
  h.fake.seedProduct('p_rosa', 5)
  h.apiPayment = apiPayment()
  h.fetchPayment = vi.fn(async () => h.apiPayment)
  h.sendWhatsApp = vi.fn(async () => ({ outcome: 'not_configured' }))
})
afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
})

describe('assinatura', () => {
  it('v1 adulterado → 401, sem consultar a API nem gravar nada', async () => {
    const res = await send({ signature: `ts=1730000000000,v1=${'0'.repeat(64)}` })
    expect(res.status).toBe(401)
    expect(res.json).toEqual({ error: 'invalid_signature' })
    expectNothingHappened()
  })

  it('assinada com outro segredo → 401', async () => {
    const res = await send({ signature: sign(PAY_ID, 'req-1', '1730000000000', 'outro-segredo') })
    expect(res.status).toBe(401)
    expectNothingHappened()
  })

  it('assinatura de outro pagamento não vale para este id → 401', async () => {
    const res = await send({ signature: sign('999') })
    expect(res.status).toBe(401)
    expectNothingHappened()
  })

  it('assinatura de outro x-request-id → 401', async () => {
    const res = await send({ requestId: 'req-OUTRO' })
    expect(res.status).toBe(401)
    expectNothingHappened()
  })

  it.each([
    ['x-signature', { signature: null }],
    ['x-request-id', { requestId: null }],
  ])('sem %s → 401', async (_h, opts) => {
    const res = await send(opts as NotifyOptions)
    expect(res.status).toBe(401)
    expectNothingHappened()
  })

  it('sem MERCADOPAGO_WEBHOOK_SECRET configurado → 401 para tudo (falha fechada)', async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET
    const res = await send()
    expect(res.status).toBe(401)
    expectNothingHappened()
  })
})

describe('data.id', () => {
  it('ausente → 400', async () => {
    const res = await send({ query: 'type=payment', body: { type: 'payment', data: {} } })
    expect(res.status).toBe(400)
    expect(res.json).toEqual({ error: 'invalid_data_id' })
    expectNothingHappened()
  })

  it.each([
    ['vazio', ''],
    ['letras', 'abc'],
    ['misto', '12a34'],
    ['negativo', '-1'],
    ['decimal', '1.5'],
    ['espaço', ' 123'],
    ['caminho', '../123'],
    ['barra codificada', '12%2F34'],
    ['21 dígitos', '1'.repeat(21)],
    ['muito longo', '9'.repeat(500)],
  ])('%s (%j) → 400, mesmo com assinatura válida para esse valor', async (_n, raw) => {
    const query = `data.id=${raw}&type=payment`
    const decoded = new URLSearchParams(query).get('data.id') ?? ''
    const res = await send({ query, signature: sign(decoded || 'x') })
    expect(res.status).toBe(400)
    expectNothingHappened()
  })

  it('20 dígitos é o limite aceito', async () => {
    const id = '1'.repeat(20)
    h.apiPayment = apiPayment({ id })
    const res = await send({ query: `data.id=${id}&type=payment` })
    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(id)
  })

  it('id só no corpo também é validado', async () => {
    const res = await send({ query: 'type=payment', body: { type: 'payment', data: { id: 'abc' } } })
    expect(res.status).toBe(400)
    expectNothingHappened()
  })
})

describe('entrada malformada', () => {
  it('corpo acima de 64 KiB → 413', async () => {
    const res = await send({ rawBody: 'x'.repeat(64 * 1024 + 1) })
    expect(res.status).toBe(413)
    expectNothingHappened()
  })

  it('JSON inválido no corpo não quebra: vale o id assinado da query', async () => {
    const res = await send({ rawBody: '{não é json' })
    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
  })

  it('tópico que não é de pagamento → 200 ignorado, sem consulta nem gravação', async () => {
    const res = await send({ query: 'id=555&topic=merchant_order', signature: null, body: null })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ outcome: 'ignored' })
    expectNothingHappened()
  })

  it('sem tipo → 200 ignorado', async () => {
    const res = await send({ query: `data.id=${PAY_ID}`, body: {} })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ outcome: 'ignored' })
    expectNothingHappened()
  })
})

describe('o corpo do webhook nunca é fonte de dados do pagamento', () => {
  it('corpo dizendo "approved" e outro valor não vale: a API diz pending → nada é confirmado', async () => {
    h.apiPayment = apiPayment({ status: 'pending' })
    const res = await send({
      body: {
        type: 'payment',
        data: { id: PAY_ID, status: 'approved', transaction_amount: 1, external_reference: 'outro' },
      },
    })

    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
    expect(st().payments[0].status).toBe('PENDING')
    expect(order().status).toBe('PENDING')
    expect(stock('p_rosa')).toBe(5)
  })
})

describe('status do pagamento (consultado na API)', () => {
  it('pending → 200, pagamento PENDING, pedido não confirmado', async () => {
    h.apiPayment = apiPayment({ status: 'pending' })
    const res = await send()
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ outcome: 'applied', paymentStatus: 'PENDING' })
    expect(res.json.orderConfirmation).toBeUndefined()
    expect(order().status).toBe('PENDING')
    expect(stock('p_rosa')).toBe(5)
  })

  it('rejected → 200, pagamento FAILED, pedido não confirmado', async () => {
    h.apiPayment = apiPayment({ status: 'rejected' })
    const res = await send()
    expect(res.status).toBe(200)
    expect(st().payments[0].status).toBe('FAILED')
    expect(order().status).toBe('PENDING')
    expect(sales()).toHaveLength(0)
  })

  it('approved → 200, pedido confirmado e estoque baixado (D2); resposta sem dados do cliente', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ outcome: 'applied', paymentStatus: 'PAID', orderConfirmation: 'confirmed' })
    expect(JSON.stringify(res.json)).not.toContain('+5511999990000')
    expect(order().status).toBe('CONFIRMED')
    expect(stock('p_rosa')).toBe(3)
    expect(h.sendWhatsApp).toHaveBeenCalledOnce()
  })

  it('pagamento inexistente na API → 404 (Mercado Pago reenvia)', async () => {
    h.apiPayment = null
    const res = await send()
    expect(res.status).toBe(404)
    expect(st().payments).toHaveLength(0)
  })

  it('erro inesperado → 500 sem detalhes, nada gravado', async () => {
    h.fetchPayment.mockRejectedValue(new Error('API fora do ar'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await send()
    expect(res.status).toBe(500)
    expect(res.json).toEqual({ error: 'internal_error' })
    expect(st().payments).toHaveLength(0)
  })
})

describe('repetição e compatibilidade com a D2', () => {
  it('a mesma notificação repetida (novo request-id) não baixa de novo nem reenvia o aviso', async () => {
    const first = await send()
    const second = await send({ requestId: 'req-2', signature: sign(PAY_ID, 'req-2') })
    const third = await send({ requestId: 'req-3', signature: sign(PAY_ID, 'req-3') })

    expect(first.json.orderConfirmation).toBe('confirmed')
    expect(second.status).toBe(200)
    expect(second.json.outcome).toBe('noop')
    expect(third.json.outcome).toBe('noop')
    expect(stock('p_rosa')).toBe(3)
    expect(sales()).toHaveLength(1)
    expect(st().payments).toHaveLength(1)
    expect(h.sendWhatsApp).toHaveBeenCalledOnce()
  })

  it('notificações simultâneas do mesmo pagamento → uma única baixa', async () => {
    const results = await Promise.all(
      ['a', 'b', 'c'].map((r) => send({ requestId: `req-${r}`, signature: sign(PAY_ID, `req-${r}`) })),
    )
    expect(results.every((r) => r.status === 200)).toBe(true)
    expect(results.filter((r) => r.json.orderConfirmation === 'confirmed')).toHaveLength(1)
    expect(stock('p_rosa')).toBe(3)
    expect(sales()).toHaveLength(1)
  })

  it('pending → approved em notificações separadas confirma uma vez, na aprovação', async () => {
    h.apiPayment = apiPayment({ status: 'pending' })
    await send()
    expect(order().status).toBe('PENDING')

    h.apiPayment = apiPayment({ status: 'approved' })
    const res = await send({ requestId: 'req-2', signature: sign(PAY_ID, 'req-2') })
    expect(res.json.orderConfirmation).toBe('confirmed')
    expect(stock('p_rosa')).toBe(3)
  })
})

describe('live_mode', () => {
  it('live_mode=false (teste) é processado normalmente e não aparece na resposta', async () => {
    const res = await send()
    expect(res.json.liveMode).toBeUndefined()
    expect(order().status).toBe('CONFIRMED')
  })

  it('live_mode=true é só registrado (log + resposta): NÃO bloqueia nesta etapa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.apiPayment = apiPayment({ liveMode: true })

    const res = await send()

    expect(res.status).toBe(200)
    expect(res.json.liveMode).toBe(true)
    expect(order().status).toBe('CONFIRMED')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain('live_mode=true')
    expect(String(warn.mock.calls[0][0])).not.toContain('+5511999990000')
  })
})

describe('credencial recusada (só token TEST- é aceito)', () => {
  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['real', 'APP_USR-segredo-real-987'],
    ['minúscula', 'test-segredo-real-987'],
  ])('credencial %s: 500 sem detalhes, sem chamar a API e sem gravar nada', async (_name, token) => {
    // Usa a consulta REAL (o mock padrão deste arquivo a substituiria).
    const real = await vi.importActual<typeof import('@/lib/mercadopago')>('@/lib/mercadopago')
    h.fetchPayment = vi.fn((id: string) => real.getMercadoPagoPayment(id))
    if (token === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
    else process.env.MERCADOPAGO_ACCESS_TOKEN = token
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await send()

    expect(res.status).toBe(500)
    expect(res.json).toEqual({ error: 'internal_error' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(st().payments).toHaveLength(0)
    expect(st().orderEvents).toHaveLength(0)
    expect(st().stockMovements).toHaveLength(0)
    expect(order().status).toBe('PENDING')
    expect(order().paymentStatus).toBe('PENDING')
    expect(stock('p_rosa')).toBe(5)
    expect(h.sendWhatsApp).not.toHaveBeenCalled()
    const logged = errorLog.mock.calls.flat().map((v) => (v instanceof Error ? `${v.message} ${v.stack}` : String(v)))
    expect(logged.join(' ')).not.toContain('segredo-real')
  })
})

// ---------------------------------------------------------------------------
// Limite do corpo (correção R1 da auditoria D3): leitura em blocos, cancelada ao
// passar de 64 KiB — com ou sem Content-Length.
// ---------------------------------------------------------------------------

const LIMIT = 64 * 1024

/** Requisição assinada para o PAY_ID, com corpo e cabeçalhos controlados pelo teste. */
function rawRequest(body: BodyInit | null, extraHeaders: Record<string, string> = {}) {
  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: { 'x-request-id': 'req-1', 'x-signature': sign(PAY_ID), ...extraHeaders },
    body,
  }
  if (body instanceof ReadableStream) init.duplex = 'half'
  return new Request(`http://localhost/api/webhooks/mercadopago?data.id=${PAY_ID}&type=payment`, init)
}

/** JSON de notificação válido com exatamente `bytes` bytes. */
function jsonOfSize(bytes: number): string {
  const base = JSON.stringify({ type: 'payment', data: { id: PAY_ID }, pad: '' })
  return base.replace('"pad":""', `"pad":"${'x'.repeat(bytes - base.length)}"`)
}

/** Stream que entrega `chunkSize` bytes por leitura, sem fim, contando leituras e cancelamento. */
function endlessStream(chunkSize: number) {
  const stats = { pulls: 0, canceled: false }
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        stats.pulls++
        controller.enqueue(new Uint8Array(chunkSize).fill(0x78))
      },
      cancel() {
        stats.canceled = true
      },
    },
    { highWaterMark: 0 },
  )
  return { stream, stats }
}

/** Stream finito com o conteúdo dado, em blocos de `chunkSize`, sem Content-Length. */
function streamOf(text: string, chunkSize = 4096) {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

describe('limite do corpo (64 KiB)', () => {
  it('corpo acima do limite COM Content-Length correto → 413 sem ler o corpo', async () => {
    const body = jsonOfSize(LIMIT + 1)
    const { stream, stats } = endlessStream(1024)
    const res = await POST(rawRequest(stream, { 'content-length': String(Buffer.byteLength(body)) }))

    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'payload_too_large' })
    expect(stats.pulls).toBe(0) // recusado pelo cabeçalho, nada foi lido
    expectNothingHappened()
  })

  it('corpo acima do limite SEM Content-Length → 413', async () => {
    const req = rawRequest(streamOf(jsonOfSize(LIMIT + 1)))
    expect(req.headers.get('content-length')).toBeNull()

    const res = await POST(req)

    expect(res.status).toBe(413)
    expectNothingHappened()
  })

  it('Content-Length falso (menor que o real) não engana: 413 pela contagem', async () => {
    const req = rawRequest(streamOf(jsonOfSize(LIMIT + 10)), { 'content-length': '100' })
    const res = await POST(req)
    expect(res.status).toBe(413)
    expectNothingHappened()
  })

  it('a leitura é interrompida e o stream cancelado assim que passa do limite', async () => {
    const { stream, stats } = endlessStream(16 * 1024)

    const res = await POST(rawRequest(stream))

    expect(res.status).toBe(413)
    expect(stats.canceled).toBe(true)
    // 4 blocos de 16 KiB = 64 KiB; o 5º estoura. Margem para o buffer interno do stream.
    expect(stats.pulls).toBeGreaterThanOrEqual(5)
    expect(stats.pulls).toBeLessThanOrEqual(7)
    expectNothingHappened()
  })

  it.each(['abc', '-1', '1.5', '', ' ', '10, 20', '0x10', '1e3'])(
    'Content-Length inválido (%j) → 400, sem ler nem processar',
    async (value) => {
      const res = await POST(rawRequest(JSON.stringify({ type: 'payment' }), { 'content-length': value }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_content_length' })
      expectNothingHappened()
    },
  )

  it('corpo com exatamente 64 KiB é aceito e processado', async () => {
    const body = jsonOfSize(LIMIT)
    expect(Buffer.byteLength(body)).toBe(LIMIT)

    const res = await POST(rawRequest(streamOf(body), { 'content-length': String(LIMIT) }))

    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
    expect(order().status).toBe('CONFIRMED')
  })

  it('um byte acima do limite exato → 413', async () => {
    const res = await POST(rawRequest(streamOf(jsonOfSize(LIMIT + 1))))
    expect(res.status).toBe(413)
  })

  it('corpo válido pequeno (com e sem Content-Length) segue o fluxo normal', async () => {
    const body = JSON.stringify({ type: 'payment', data: { id: PAY_ID } })
    const withHeader = await POST(rawRequest(body, { 'content-length': String(Buffer.byteLength(body)) }))
    expect(withHeader.status).toBe(200)
    expect(order().status).toBe('CONFIRMED')

    const again = await POST(rawRequest(streamOf(body)))
    expect(again.status).toBe(200)
    expect((await again.json()).outcome).toBe('noop') // repetição continua idempotente
  })

  it('sem corpo: o id assinado da query continua valendo', async () => {
    const res = await POST(rawRequest(null))
    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
  })

  it('o limite vale antes de tudo: até tópico ignorado com corpo grande recebe 413', async () => {
    const req = new Request('http://localhost/api/webhooks/mercadopago?id=1&topic=merchant_order', {
      method: 'POST',
      body: streamOf('x'.repeat(LIMIT + 1)),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })
})

describe('falha durante a leitura do corpo', () => {
  /** Stream que entrega `chunks` e depois falha (conexão interrompida no meio do envio). */
  function failingStream(chunks: string[]) {
    let i = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[i++]))
        else controller.error(new Error('conexão interrompida'))
      },
    })
  }

  it('corpo recebido pela metade → 400, sem consultar a API nem gravar nada', async () => {
    // Metade de um JSON válido de notificação, depois erro.
    const res = await POST(rawRequest(failingStream(['{"type":"payment","data":{"id":"12'])))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'body_read_error' })
    expectNothingHappened()
  })

  it('erro logo na primeira leitura → 400, sem processar', async () => {
    const res = await POST(rawRequest(failingStream([])))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'body_read_error' })
    expectNothingHappened()
  })

  it('falha de leitura vale antes de tudo: nem tópico ignorado recebe 200', async () => {
    const req = new Request('http://localhost/api/webhooks/mercadopago?id=1&topic=merchant_order', {
      method: 'POST',
      body: failingStream(['{"topic":']),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('corpo realmente vazio (string vazia) continua valendo como corpo ausente', async () => {
    const res = await POST(rawRequest(''))
    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
  })

  it('stream vazio que termina normalmente continua valendo como corpo ausente', async () => {
    const res = await POST(rawRequest(new ReadableStream({ start: (c) => c.close() })))
    expect(res.status).toBe(200)
    expect(h.fetchPayment).toHaveBeenCalledWith(PAY_ID)
  })
})
