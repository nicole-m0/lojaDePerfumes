'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CartItem, Product } from '../types'
import { CartContext, type CartContextValue, type CartNotification } from './cart-context'

const STORAGE_KEY = 'venus-cart-v1'

function loadInitialItems(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CartItem[]
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadInitialItems)
  const [isOpen, setIsOpen] = useState(false)
  const [notification, setNotification] = useState<CartNotification | null>(null)
  const notificationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // localStorage indisponível (modo privado etc.) — ignora silenciosamente
    }
  }, [items])

  useEffect(() => {
    return () => {
      if (notificationTimeout.current) clearTimeout(notificationTimeout.current)
    }
  }, [])

  const addItem = (product: Product, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        )
      }
      return [...current, { product, quantity }]
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
    setItems((current) =>
      current.map((item) => (item.product.id === productId ? { ...item, quantity } : item)),
    )
  }

  const clearCart = () => setItems([])

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  )
  const totalPrice = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.product.price, 0),
    [items],
  )

  const value: CartContextValue = {
    items,
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
