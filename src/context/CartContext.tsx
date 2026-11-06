'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CartItem, Product } from '../types'
import { clampToAvailable } from '../lib/stock'
import { loadCart, saveCart } from '../lib/cart-storage'
import { CartContext, type CartContextValue, type CartNotification } from './cart-context'

// Persistência + migração da chave antiga: ver src/lib/cart-storage.ts.
//
// Hidratação: o servidor não tem acesso ao localStorage, então o primeiro render
// no navegador PRECISA ser igual ao do servidor (carrinho vazio). O carrinho
// salvo só é lido depois de montar (useEffect) — ler no inicializador do
// useState causava o erro de hidratação React #418 quando havia itens salvos.
// `isHydrated` permite à UI mostrar "carregando" em vez de "carrinho vazio".
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  // clearCart() chamado ANTES da leitura do storage (ex.: página de sucesso, cujo
  // efeito roda antes do efeito deste provider) precisa prevalecer sobre o carrinho salvo.
  const clearedBeforeHydration = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [notification, setNotification] = useState<CartNotification | null>(null)
  const notificationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let saved: CartItem[] = []
    try {
      saved = loadCart(window.localStorage)
    } catch {
      // window.localStorage pode lançar ao ser acessado (bloqueio de cookies)
    }
    if (!clearedBeforeHydration.current) setItems(saved)
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    // Nunca grava antes de ler: evitaria sobrescrever o carrinho salvo com [].
    if (!isHydrated) return
    try {
      saveCart(window.localStorage, items)
    } catch {
      // window.localStorage pode lançar ao ser acessado (bloqueio de cookies)
    }
  }, [items, isHydrated])

  useEffect(() => {
    return () => {
      if (notificationTimeout.current) clearTimeout(notificationTimeout.current)
    }
  }, [])

  const addItem = (product: Product, quantity = 1) => {
    // Esgotado: não adiciona (a UI já desabilita o botão; isto é a rede de segurança).
    if (clampToAvailable(quantity, product.availableQuantity) === 0) return

    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        // Nunca passa do estoque conhecido; atualiza o snapshot do produto.
        const next = clampToAvailable(existing.quantity + quantity, product.availableQuantity)
        return current.map((item) =>
          item.product.id === product.id ? { ...item, product, quantity: next } : item,
        )
      }
      return [
        ...current,
        { product, quantity: clampToAvailable(quantity, product.availableQuantity) },
      ]
    })

    if (notificationTimeout.current) clearTimeout(notificationTimeout.current)
    setNotification({ product, id: Date.now() })
    notificationTimeout.current = setTimeout(() => setNotification(null), 4000)
  }

  const dismissNotification = () => {
    if (notificationTimeout.current) clearTimeout(notificationTimeout.current)
    setNotification(null)
  }

  const removeItem = (productId: string) => {
    setItems((current) => current.filter((item) => item.product.id !== productId))
  }

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) {
      removeItem(productId)
      return
    }
    // Limita ao estoque conhecido, mas nunca remove por isso: um item que esgotou
    // continua no carrinho (o servidor sinaliza) até o cliente removê-lo.
    setItems((current) =>
      current.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity: Math.max(1, clampToAvailable(quantity, item.product.availableQuantity)),
            }
          : item,
      ),
    )
  }

  const clearCart = () => {
    if (!isHydrated) clearedBeforeHydration.current = true
    setItems([])
  }

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items])
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.product.price, 0),
    [items],
  )

  const value: CartContextValue = {
    items,
    isHydrated,
    isOpen,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    notification,
    dismissNotification,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
