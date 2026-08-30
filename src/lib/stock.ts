// Estoque — funções puras (validação/checagem). Escrita real (StockMovement,
// decremento/devolução) fica em src/server/stock.ts, que usa estas funções.

/** Abaixo ou igual a este valor o produto é sinalizado como estoque crítico. */
export const LOW_STOCK_THRESHOLD = 0

export function isLowStock(stockOnHand: number): boolean {
  return stockOnHand <= LOW_STOCK_THRESHOLD
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
