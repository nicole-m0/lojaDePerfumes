// Estoque — apenas leitura/exibição nesta fase.
// Regras completas de movimentação (StockMovement, baixa automática) são fase futura.

/** Abaixo ou igual a este valor o produto é sinalizado como estoque crítico. */
export const LOW_STOCK_THRESHOLD = 0

export function isLowStock(stockOnHand: number): boolean {
  return stockOnHand <= LOW_STOCK_THRESHOLD
}
