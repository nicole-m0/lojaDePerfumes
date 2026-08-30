'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireStaff } from '@/server/guard'
import {
  adjustStockToQuantity,
  getProductForStock,
  registerManualEntry,
  registerManualExit,
  InsufficientStockError,
} from '@/server/stock'

export interface StockActionState {
  error?: string
  ok?: boolean
}

class ActionError extends Error {}

function revalidateStock(productId: string) {
  revalidatePath(`/admin/estoque/${productId}`)
  revalidatePath('/admin/estoque')
  revalidatePath('/admin/produtos')
  revalidatePath('/admin')
}

const noteSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => v || null)

// ---------------------------------------------------------------------------
// Entrada manual (INBOUND)
// ---------------------------------------------------------------------------

const entrySchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(['PURCHASE', 'CUSTOMER_RETURN', 'INVENTORY_COUNT', 'OTHER']),
  quantity: z.coerce.number().int('Quantidade inválida.').min(1, 'Informe uma quantidade maior que zero.'),
  note: noteSchema,
})

export async function registerStockEntry(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const staff = await requireStaff()
  const parsed = entrySchema.safeParse({
    productId: formData.get('productId'),
    reason: formData.get('reason'),
    quantity: formData.get('quantity'),
    note: (formData.get('note') as string) ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  const d = parsed.data

  try {
    const product = await getProductForStock(d.productId)
    if (!product) throw new ActionError('Produto não encontrado.')

    await registerManualEntry({
      productId: d.productId,
      reason: d.reason,
      quantity: d.quantity,
      note: d.note,
      userId: staff.id,
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[registerStockEntry]', err)
    return { error: 'Não foi possível registrar a entrada.' }
  }

  revalidateStock(d.productId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Saída manual (OUTBOUND) — condicional/atômica contra saldo negativo
// ---------------------------------------------------------------------------

const exitSchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(['LOSS', 'OTHER']),
  quantity: z.coerce.number().int('Quantidade inválida.').min(1, 'Informe uma quantidade maior que zero.'),
  note: noteSchema,
})

export async function registerStockExit(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const staff = await requireStaff()
  const parsed = exitSchema.safeParse({
    productId: formData.get('productId'),
    reason: formData.get('reason'),
    quantity: formData.get('quantity'),
    note: (formData.get('note') as string) ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  const d = parsed.data

  try {
    const product = await getProductForStock(d.productId)
    if (!product) throw new ActionError('Produto não encontrado.')

    await registerManualExit({
      productId: d.productId,
      productName: product.name,
      reason: d.reason,
      quantity: d.quantity,
      note: d.note,
      userId: staff.id,
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    if (err instanceof InsufficientStockError) return { error: err.message }
    console.error('[registerStockExit]', err)
    return { error: 'Não foi possível registrar a saída.' }
  }

  revalidateStock(d.productId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Ajuste por contagem física — informa-se o novo saldo, a diferença é calculada
// ---------------------------------------------------------------------------

const adjustSchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(['MANUAL_ADJUSTMENT', 'INVENTORY_COUNT']),
  newQuantity: z.coerce.number().int('Quantidade inválida.').min(0, 'O saldo não pode ser negativo.'),
  note: noteSchema,
})

export async function adjustStockQuantity(
  _prev: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  const staff = await requireStaff()
  const parsed = adjustSchema.safeParse({
    productId: formData.get('productId'),
    reason: formData.get('reason'),
    newQuantity: formData.get('newQuantity'),
    note: (formData.get('note') as string) ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  const d = parsed.data

  try {
    const product = await getProductForStock(d.productId)
    if (!product) throw new ActionError('Produto não encontrado.')
    if (d.newQuantity === product.stockOnHand) {
      throw new ActionError('O saldo informado é igual ao saldo atual — nada a ajustar.')
    }

    await adjustStockToQuantity({
      productId: d.productId,
      newQuantity: d.newQuantity,
      reason: d.reason,
      note: d.note,
      userId: staff.id,
    })
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message }
    console.error('[adjustStockQuantity]', err)
    return { error: 'Não foi possível ajustar o estoque.' }
  }

  revalidateStock(d.productId)
  return { ok: true }
}
