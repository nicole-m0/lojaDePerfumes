// Agregação do carrinho -> um único pacote para cotar frete. Função pura e
// testável: não faz I/O e não conhece provedor.
//
// Heurística conservadora (tende a superestimar, nunca a subestimar):
//  - peso: soma de peso * quantidade de todos os itens;
//  - altura: itens empilhados -> soma de altura * quantidade;
//  - largura / comprimento: o maior valor entre os itens.
// No fim aplica os mínimos aceitos pelos Correios / Melhor Envio, para a cotação
// não ser recusada por pacote pequeno demais.

import type { PackageDimensions, ShippingItemInput } from './types'

// Mínimos de encomenda (Correios PAC/SEDEX via Melhor Envio).
export const MIN_LENGTH_CM = 16
export const MIN_WIDTH_CM = 11
export const MIN_HEIGHT_CM = 2
export const MIN_WEIGHT_GRAMS = 50

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const clampInt = (value: number, min: number) => Math.max(Math.ceil(value), min)

/** Combina os itens do carrinho num pacote único, respeitando os mínimos. */
export function aggregatePackage(items: ShippingItemInput[]): PackageDimensions {
  const positive = items.filter((i) => i.quantity > 0)

  const weightGrams = sum(positive.map((i) => i.weightGrams * i.quantity))
  const heightCm = sum(positive.map((i) => i.heightCm * i.quantity))
  const widthCm = positive.length ? Math.max(...positive.map((i) => i.widthCm)) : 0
  const lengthCm = positive.length ? Math.max(...positive.map((i) => i.lengthCm)) : 0

  return {
    weightGrams: clampInt(weightGrams, MIN_WEIGHT_GRAMS),
    heightCm: clampInt(heightCm, MIN_HEIGHT_CM),
    widthCm: clampInt(widthCm, MIN_WIDTH_CM),
    lengthCm: clampInt(lengthCm, MIN_LENGTH_CM),
  }
}

/** Valor declarado do pacote (para seguro), em centavos: soma de preço * qtd. */
export function declaredValueCents(items: ShippingItemInput[]): number {
  return sum(items.filter((i) => i.quantity > 0).map((i) => i.unitPriceCents * i.quantity))
}
