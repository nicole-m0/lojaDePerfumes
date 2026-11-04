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
