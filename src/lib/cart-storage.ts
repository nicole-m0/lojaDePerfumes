import type { CartItem } from '../types'

// Persistência do carrinho no navegador (localStorage), com migração da chave
// da identidade anterior. Funções puras sobre uma interface de Storage — testáveis
// sem navegador.
//
// Estratégia de transição (sem perder carrinhos):
// 1. Lê a chave nova. Se existir, ela manda (a antiga é ignorada).
// 2. Se não existir, procura a chave legada; se tiver um carrinho válido, copia
//    para a chave nova e SÓ DEPOIS de gravar com sucesso remove a antiga.
// 3. Se a gravação falhar (modo privado, cota cheia), mantém a chave antiga
//    intacta e usa o carrinho em memória — nada é perdido.
// A chave legada pode ser removida do código quando não houver mais visitantes
// com carrinhos antigos (alguns meses após o deploy).

export const CART_STORAGE_KEY = 'bella-cheirosa-cart-v1'

/** Chaves de versões anteriores do site, em ordem de preferência. */
export const LEGACY_CART_STORAGE_KEYS = ['venus-cart-v2'] as const

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Interpreta o JSON salvo, descartando entradas malformadas (nunca lança). */
export function parseStoredCart(raw: string | null): CartItem[] | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return null
    return data.filter(
      (item): item is CartItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as CartItem).product?.id === 'string' &&
        Number.isInteger((item as CartItem).quantity) &&
        (item as CartItem).quantity > 0,
    )
  } catch {
    return null
  }
}

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function loadCart(storage: StorageLike): CartItem[] {
  const current = parseStoredCart(safeGet(storage, CART_STORAGE_KEY))
  if (current) return current

  for (const legacyKey of LEGACY_CART_STORAGE_KEYS) {
    const legacy = parseStoredCart(safeGet(storage, legacyKey))
    if (!legacy) continue
    try {
      storage.setItem(CART_STORAGE_KEY, JSON.stringify(legacy))
      storage.removeItem(legacyKey)
    } catch {
      // Não conseguiu migrar agora: mantém a chave antiga para tentar de novo.
    }
    return legacy
  }
  return []
}

export function saveCart(storage: StorageLike, items: CartItem[]): void {
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage indisponível (modo privado etc.) — ignora silenciosamente
  }
}
