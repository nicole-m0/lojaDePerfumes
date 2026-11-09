import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fake mínima do Prisma só para WhatsAppMessage. Deliberadamente NÃO reusa
// src/test/fake-prisma.ts: aquela fake modela o lock/transação de Payment
// (overpayment concorrente), invariante que não existe aqui — este serviço
// não precisa de $transaction nem de FOR UPDATE.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

interface Row {
  [k: string]: unknown
}

const h = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    whatsAppMessage: {
      async findFirst({ where }: { where: { orderId: string; templateName: string; status: { in: string[] } } }) {
        return (
          h.rows.find(
            (r) =>
              r.orderId === where.orderId &&
              r.templateName === where.templateName &&
              where.status.in.includes(r.status as string),
          ) ?? null
        )
      },
      async create({ data }: { data: Row }) {
        const row: Row = {
          id: `wam_${++h.seq}`,
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          failedAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }
        h.rows.push(row)
        return { ...row }
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const row = h.rows.find((r) => r.id === where.id)
        if (!row) throw new Error('WhatsAppMessage não encontrado (fake)')
        Object.assign(row, data)
        return { ...row }
      },
    },
  },
}))

import { sendOrderWhatsAppNotification } from './whatsapp'
import { WhatsAppCloudApiError } from '@/lib/whatsapp/cloud-api'

const ORIG = { ...process.env }
const TOKEN = 'super-secret-access-token'

function configure() {
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
}

beforeEach(() => {
  h.rows = []
  h.seq = 0
})

afterEach(() => {
  process.env = { ...ORIG }
  vi.restoreAllMocks()
})

const baseInput = {
  orderId: 'ord_1',
  phone: '(11) 99999-9999',
  templateName: 'pedido_confirmado',
  languageCode: 'pt_BR',
  bodyParams: ['42'],
}

describe('sendOrderWhatsAppNotification', () => {
  it('telefone válido + envio bem-sucedido: cria PENDING e move para SENT com providerMessageId/sentAt', async () => {
    configure()
    const send = vi.fn().mockResolvedValue({ providerMessageId: 'wamid.ABC' })

    const result = await sendOrderWhatsAppNotification(baseInput, { send })

    expect(result.outcome).toBe('sent')
    expect(result.providerMessageId).toBe('wamid.ABC')
    expect(send).toHaveBeenCalledWith({
      to: '+5511999999999',
      templateName: 'pedido_confirmado',
      languageCode: 'pt_BR',
      bodyParams: ['42'],
    })

    expect(h.rows).toHaveLength(1)
    const row = h.rows[0]
    expect(row.status).toBe('SENT')
    expect(row.providerMessageId).toBe('wamid.ABC')
    expect(row.sentAt).toBeInstanceOf(Date)
    expect(row.phone).toBe('+5511999999999')
    expect(row.orderId).toBe('ord_1')
    expect(row.templateName).toBe('pedido_confirmado')
  })

  it('cria o registro como PENDING ANTES de chamar o envio', async () => {
    configure()
    let statusDuringSend: unknown
    const send = vi.fn().mockImplementation(async () => {
      statusDuringSend = h.rows[0]?.status
      return { providerMessageId: 'wamid.X' }
    })

    await sendOrderWhatsAppNotification(baseInput, { send })

    expect(statusDuringSend).toBe('PENDING')
  })

  it('telefone inválido: não cria mensagem nem chama a Cloud API', async () => {
    configure()
    const send = vi.fn()

    const result = await sendOrderWhatsAppNotification({ ...baseInput, phone: '123' }, { send })

    expect(result.outcome).toBe('invalid_phone')
    expect(send).not.toHaveBeenCalled()
    expect(h.rows).toHaveLength(0)
  })

  it('telefone ausente (null/undefined): mesmo tratamento de telefone inválido', async () => {
    configure()
    const send = vi.fn()
    const result = await sendOrderWhatsAppNotification({ ...baseInput, phone: null }, { send })
    expect(result.outcome).toBe('invalid_phone')
    expect(send).not.toHaveBeenCalled()
  })

  it('falha da Cloud API: move para FAILED com failedAt e errorMessage seguro (sem token)', async () => {
    configure()
    const send = vi.fn().mockRejectedValue(new WhatsAppCloudApiError('Invalid parameter', 400, 100))

    const result = await sendOrderWhatsAppNotification(baseInput, { send })

    expect(result.outcome).toBe('failed')
    expect(result.error).toBe('Invalid parameter')

    const row = h.rows[0]
    expect(row.status).toBe('FAILED')
    expect(row.failedAt).toBeInstanceOf(Date)
    expect(row.errorMessage).toBe('Invalid parameter')
    expect(row.providerMessageId).toBeNull()
  })

  it('erro inesperado (não WhatsAppCloudApiError) vira mensagem genérica — nunca o token', async () => {
    configure()
    // Simula um bug hipotético em que o erro cru carregaria o token — o serviço
    // NUNCA deve persistir esse texto, só o fallback genérico.
    const send = vi.fn().mockRejectedValue(new Error(`boom leaked ${TOKEN}`))

    const result = await sendOrderWhatsAppNotification(baseInput, { send })

    expect(result.outcome).toBe('failed')
    expect(result.error).toBe('Erro inesperado ao enviar mensagem.')
    expect(String(result.error)).not.toContain(TOKEN)

    const row = h.rows[0]
    expect(row.status).toBe('FAILED')
    expect(row.errorMessage).toBe('Erro inesperado ao enviar mensagem.')
    expect(String(row.errorMessage)).not.toContain(TOKEN)
  })

  it('ausência de configuração: não cria mensagem nem chama a Cloud API', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    delete process.env.WHATSAPP_ACCESS_TOKEN
    const send = vi.fn()

    const result = await sendOrderWhatsAppNotification(baseInput, { send })

    expect(result.outcome).toBe('not_configured')
    expect(send).not.toHaveBeenCalled()
    expect(h.rows).toHaveLength(0)
  })

  it('comportamento best-effort: falha do envio nunca lança, sempre resolve', async () => {
    configure()
    const send = vi.fn().mockRejectedValue(new WhatsAppCloudApiError('falhou'))
    await expect(sendOrderWhatsAppNotification(baseInput, { send })).resolves.toMatchObject({
      outcome: 'failed',
    })
  })

  it('comportamento best-effort: erro inesperado no próprio banco nunca lança', async () => {
    configure()
    const send = vi.fn()
    // Simula o create() do Prisma falhando antes mesmo de chamar o envio.
    const { prisma } = await import('@/lib/prisma')
    vi.spyOn(prisma.whatsAppMessage, 'create').mockRejectedValueOnce(new Error('DB fora do ar'))

    await expect(sendOrderWhatsAppNotification(baseInput, { send })).resolves.toMatchObject({
      outcome: 'failed',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('deduplicação: não reenvia o mesmo template para o mesmo pedido já SENT', async () => {
    configure()
    const send = vi.fn().mockResolvedValue({ providerMessageId: 'wamid.FIRST' })
    await sendOrderWhatsAppNotification(baseInput, { send })

    const result = await sendOrderWhatsAppNotification(baseInput, { send })

    expect(result.outcome).toBe('skipped_duplicate')
    expect(result.providerMessageId).toBe('wamid.FIRST')
    expect(send).toHaveBeenCalledTimes(1) // não chamou de novo
    expect(h.rows).toHaveLength(1) // não criou segunda linha
  })

  it('deduplicação NÃO bloqueia retry de uma tentativa anterior FAILED', async () => {
    configure()
    const send = vi
      .fn()
      .mockRejectedValueOnce(new WhatsAppCloudApiError('falhou'))
      .mockResolvedValueOnce({ providerMessageId: 'wamid.RETRY' })

    const first = await sendOrderWhatsAppNotification(baseInput, { send })
    expect(first.outcome).toBe('failed')

    const second = await sendOrderWhatsAppNotification(baseInput, { send })
    expect(second.outcome).toBe('sent')
    expect(second.providerMessageId).toBe('wamid.RETRY')
    expect(send).toHaveBeenCalledTimes(2)
    expect(h.rows).toHaveLength(2)
  })
})
