export function formatPrice(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function discountPercent(price: number, originalPrice?: number): number | null {
  if (!originalPrice || originalPrice <= price) return null
  return Math.round(((originalPrice - price) / originalPrice) * 100)
}

// --- Dinheiro: o banco guarda centavos (inteiro); a UI trabalha em reais. ---

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100
}

/** Converte "129,90", "R$ 129,90", "129.90" ou 129.9 em centavos inteiros. */
export function reaisToCents(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100)
  const normalized = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

export function formatCents(cents: number): string {
  return formatPrice(centsToReais(cents))
}
