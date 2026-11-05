// Estoque — funções puras (validação/checagem). Escrita real (StockMovement,
// decremento/devolução) fica em src/server/stock.ts, que usa estas funções.

/** Abaixo ou igual a este valor o produto é sinalizado como estoque crítico. */
export const LOW_STOCK_THRESHOLD = 0

/** Limite de unidades por linha do carrinho/pedido (mesmo valor do checkout). */
export const MAX_QTY_PER_LINE = 99

export function isLowStock(stockOnHand: number): boolean {
  return stockOnHand <= LOW_STOCK_THRESHOLD
}

/**
 * Quantas unidades a loja pública deixa comprar de um produto: o saldo em estoque,
 * nunca negativo e limitado a MAX_QTY_PER_LINE. 0 = esgotado.
 */
export function maxPurchasableQuantity(stockOnHand: number | null | undefined): number {
  const stock = Number.isFinite(stockOnHand) ? Math.trunc(stockOnHand as number) : 0
  return Math.min(Math.max(stock, 0), MAX_QTY_PER_LINE)
}

export function isOutOfStock(stockOnHand: number | null | undefined): boolean {
  return maxPurchasableQuantity(stockOnHand) === 0
}

/**
 * Ajusta a quantidade desejada ao que pode ser comprado. `available` indefinido
 * significa "desconhecido no cliente" (ex.: carrinho salvo antes desta versão):
 * aplica só o limite por linha — a checagem autoritativa é sempre no servidor.
 */
export function clampToAvailable(desired: number, available: number | undefined): number {
  const cap = available === undefined ? MAX_QTY_PER_LINE : Math.min(available, MAX_QTY_PER_LINE)
  const qty = Number.isFinite(desired) ? Math.trunc(desired) : 0
  return Math.max(0, Math.min(qty, cap))
}

export interface StockAvailabilityItem {
  productId: string
  productName: string
  requestedQuantity: number
  availableQuantity: number
}

/** Filtra, de uma lista de itens pedidos, só os que pedem mais do que o disponível. */
export function findInsufficientStockItems(
  items: StockAvailabilityItem[],
): StockAvailabilityItem[] {
  return items.filter((item) => item.requestedQuantity > item.availableQuantity)
}

// --- Histórico de estoque de UM pedido (por produto) -----------------------
// Fonte da verdade para baixa e devolução ligadas a pedido: as movimentações
// gravadas com `orderId`, e não o status do pedido. Assim confirmar, cancelar e
// registrar retorno ficam idempotentes POR PRODUTO, inclusive em devoluções parciais.

export interface OrderStockMovementInput {
  productId: string
  type: string
  reason: string | null
  quantity: number
}

export interface OrderStockBalance {
  /** Unidades que saíram por venda deste pedido (OUTBOUND + SALE). */
  out: number
  /** Unidades que voltaram ao estoque por este pedido (RETURN, automático ou físico). */
  back: number
}

/** Soma, por produto, as saídas por venda e as devoluções de um pedido. */
export function summarizeOrderStockLedger(
  movements: readonly OrderStockMovementInput[],
): Map<string, OrderStockBalance> {
  const ledger = new Map<string, OrderStockBalance>()
  for (const m of movements) {
    const isSale = m.type === 'OUTBOUND' && m.reason === 'SALE'
    const isReturn = m.type === 'RETURN'
    if (!isSale && !isReturn) continue
    const entry = ledger.get(m.productId) ?? { out: 0, back: 0 }
    if (isSale) entry.out += m.quantity
    else entry.back += m.quantity
    ledger.set(m.productId, entry)
  }
  return ledger
}

/** Quantidade pedida por produto (soma linhas repetidas do mesmo produto). */
export function requiredQuantityByProduct(
  items: readonly { productId: string; quantity: number }[],
): Map<string, number> {
  const required = new Map<string, number>()
  for (const item of items) {
    required.set(item.productId, (required.get(item.productId) ?? 0) + item.quantity)
  }
  return required
}

/** Unidades que ainda faltam sair, por produto, para atender o pedido (> 0). */
export function quantitiesToDecrement(
  required: ReadonlyMap<string, number>,
  ledger: ReadonlyMap<string, OrderStockBalance>,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const [productId, qty] of required) {
    const missing = qty - (ledger.get(productId)?.out ?? 0)
    if (missing > 0) result.set(productId, missing)
  }
  return result
}

/** Unidades que saíram e ainda não voltaram, por produto (> 0). */
export function pendingReturnByProduct(
  ledger: ReadonlyMap<string, OrderStockBalance>,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const [productId, { out, back }] of ledger) {
    const pending = out - back
    if (pending > 0) result.set(productId, pending)
  }
  return result
}
